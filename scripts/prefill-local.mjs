#!/usr/bin/env node
// 初次大规模预填充：本地直连公开列表页，规则解析后分批导入站点库。
// 默认 dry-run 只生成本地 JSON；--commit 才会调用 /api/admin/import 写库。
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAJOR_GROUPS, companyKey, classifyJob, inferCompanyNature,
  inferPositionType, parseSourceDate,
} from '../functions/core.mjs';

const DEFAULT_BASE = 'https://internradar-tb8isknpdbc.qoder.zone';
const USER_AGENT = 'InternRadar/1.0 (+COMPLIANCE.md)';
const ROOT = fileURLToPath(new URL('../', import.meta.url));

const NCSS_SOURCE = {
  id: 'ncss',
  name: '国家大学生就业服务平台',
  baseUrl: 'https://newjob.ncss.cn',
  listApi: 'https://newjob.ncss.cn/student/jobs/jobslist/ajax/',
  detailUrl: 'https://newjob.ncss.cn/student/jobs/{jobId}/detail.html',
};
const YJS_SOURCE = {
  id: 'yjs',
  name: '应届生求职网专业频道',
  baseUrl: 'https://www.yingjiesheng.com',
};
const YJS_CITIES = ['beijing', 'shanghai', 'guangzhou', 'shenzhen', 'nanjing', 'tianjin', 'wuhan', 'chengdu', 'other'];
const YJS_EXTRA_CHANNELS = [
  ['buxian', '专业不限'], ['caikuai', '财会类'], ['like', '理科类'],
  ['renli', '人力资源类'], ['yingxiao', '营销类'],
];

const YJS_ROW_RE = /<tr[^>]*class=["']jobli["'][^>]*>([\s\S]*?)<\/tr>/gi;
const YJS_CELL_RE = /<td[^>]*>([\s\S]*?)<\/td>/gi;
const YJS_ANCHOR_RE = /<a[^>]+href=["'](?:https?:)?\/\/(?:www\.)?yingjiesheng\.com\/(job-\d{3}-\d{3}-\d{3}\.html)["'][^>]*>([\s\S]*?)<\/a>/i;
const YJS_BRACKET_RE = /^\[([^\]]{0,24})\]\s*/;
const YJS_GENERIC_TITLE_RE = /^(20\d{2}\s*年?\s*)?(届\s*)?(校园)?招聘(会)?$|^(招聘)?(公告|简章|启事)$/;
const YJS_CATEGORY_TITLE_RE = /^(经管|综合|科技|工学|理学|文学|法学|教育学|经济学|管理学|艺术学|医学|农学|哲学|历史学)类$/;
const YJS_YEAR_PREFIX_RE = /^20\d{2}\s*(年|届)?\s*(校园)?招聘\s*/;
const YJS_COMPANY_RE = /(公司|集团|银行|证券|基金|保险|事务所|研究院|研究所|大学|学院|学校|中学|小学|医院|中心|机构|出版社|协会|学会|厂|酒店|商行|合作社)$/;

const lastRequestByHost = new Map();
const requests = { total: 0, failed: 0, blocked: 0 };

function parseArgs(argv) {
  const options = {
    base: process.env.INTERNRADAR_BASE_URL || DEFAULT_BASE,
    commit: false,
    ncssPages: 10,
    ncssTypes: '03',
    yjsChannels: 'all',
    cities: true,
    maxAgeDays: 120,
    out: null,
    from: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--commit') options.commit = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--no-cities') options.cities = false;
    else if (arg === '--base') options.base = argv[++index] || '';
    else if (arg.startsWith('--base=')) options.base = arg.slice('--base='.length);
    else if (arg === '--ncss-pages') options.ncssPages = Number(argv[++index]);
    else if (arg === '--ncss-types') options.ncssTypes = argv[++index] || '';
    else if (arg.startsWith('--ncss-types=')) options.ncssTypes = arg.slice('--ncss-types='.length);
    else if (arg === '--yjs-channels') options.yjsChannels = argv[++index] || 'all';
    else if (arg === '--max-age-days') options.maxAgeDays = Number(argv[++index]);
    else if (arg === '--out') options.out = argv[++index] || '';
    else if (arg === '--from') options.from = argv[++index] || '';
    else if (arg.startsWith('--from=')) options.from = arg.slice('--from='.length);
    else throw new Error(`未知参数：${arg}`);
  }
  if (!/^https?:\/\/\S+$/i.test(options.base)) throw new Error('--base 需要是合法的 http(s) 地址。');
  options.ncssPages = Math.max(0, Math.min(20, Number(options.ncssPages) || 0));
  options.maxAgeDays = Math.max(0, Math.min(3650, Number(options.maxAgeDays) || 0));
  return options;
}

function usage() {
  console.log(`用法：node scripts/prefill-local.mjs [选项]

  --commit             导入线上库（默认只生成本地 JSON）
  --base <url>         站点地址，默认 ${DEFAULT_BASE}
  --ncss-pages <n>     ncss 列表页数，默认 10（当前源约 200 条）
  --ncss-types <s>     ncss 岗位类型，默认 03（实习）；01 为校招
  --yjs-channels <s>   all 或逗号分隔的频道 slug，默认 all
  --no-cities          不抓应届生的城市子频道（默认抓取）
  --max-age-days <n>   过滤超过 N 天未发布的岗位，0 表示不过滤，默认 120
  --out <file>         本地输出路径
  --from <file>        跳过采集，直接导入已生成的 JSON
  --help               显示帮助`);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function pacedFetch(url, { accept = 'text/html,application/json;q=0.9,*/*;q=0.8', timeout = 15000 } = {}) {
  const host = new URL(url).hostname;
  const last = lastRequestByHost.get(host) || 0;
  const wait = 1100 + Math.random() * 500 - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  lastRequestByHost.set(host, Date.now());
  requests.total += 1;
  let response;
  try {
    response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept, 'accept-language': 'zh-CN,zh;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    requests.failed += 1;
    throw new Error(`请求失败 ${url}：${error.message}`);
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  const text = decodeBuffer(buffer);
  const head = text.slice(0, 8000);
  const blocked = response.status === 403 || response.status === 503
    || ['验证码', '人机验证', '访问过于频繁', 'IP 限制', 'aliyun_waf', 'renderData'].some((marker) => head.includes(marker));
  if (blocked) {
    requests.blocked += 1;
    throw new Error(`触发反爬拦截（${response.status}）：${url}`);
  }
  if (!response.ok) {
    requests.failed += 1;
    throw new Error(`HTTP ${response.status}：${url}`);
  }
  return text;
}

function decodeBuffer(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    // 应届生列表是 GBK
  }
  try {
    return new TextDecoder('gbk').decode(buffer);
  } catch {
    return new TextDecoder().decode(buffer);
  }
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value, max = 200) {
  const text = stripHtml(value).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function sha256(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

function stableJobId(sourceKey) {
  return sha256(sourceKey).slice(0, 32);
}

function cleanLocation(value) {
  const text = cleanText(value, 120);
  if (!text) return null;
  const parts = [...new Set(text.split(/[,，、|/]/).map((part) => part.trim())
    .filter((part) => part && part !== '…' && part !== '...' && part !== '其他'))];
  if (!parts.length) return null;
  return parts.length > 3 ? `${parts.slice(0, 2).join('、')}等` : parts.join('、');
}

function splitYjsLabel(label) {
  const bracket = YJS_BRACKET_RE.exec(label);
  const cityTag = bracket ? bracket[1] : '';
  const tail = (bracket ? label.slice(bracket[0].length) : label).trim();
  const space = tail.search(/\s/);
  if (space > 1) {
    const head = tail.slice(0, space);
    if (YJS_COMPANY_RE.test(head)) {
      return { company: head, position: tail.slice(space + 1).trim() || tail, cityTag };
    }
  }
  return { company: '', position: tail, cityTag };
}

function inferPositionTypeFor(source, text) {
  if (source === 'ncss') return '实习';
  return inferPositionType(text) || '校招';
}

export function isFresh(publishedAt, maxAgeDays) {
  if (!maxAgeDays || !publishedAt) return true;
  const published = Date.parse(publishedAt);
  if (Number.isNaN(published)) return true;
  return published >= Date.now() - maxAgeDays * 86400000;
}

function buildJob({ id, source, company, position, location, major, tags, property, pay, publishedAt, applyLink, sourceUrl, confidence, positionType: positionTypeOverride }) {
  const companyName = cleanText(company, 100) || '';
  const positionTitle = cleanText(position, 160) || '';
  const positionType = positionTypeOverride || inferPositionTypeFor(source, `${positionTitle} ${major || ''}`);
  const classification = classifyJob({
    company: companyName,
    position: positionTitle,
    majorRequirements: major,
    tags: source === 'ncss' ? tags : '',
    positionType,
    location,
    applyLink: applyLink || sourceUrl,
    sourceUrl,
  });
  return {
    id,
    company: companyName || '未识别企业',
    position_title: positionTitle,
    location: cleanLocation(location),
    position_type: classification.position_type,
    is_intern: classification.is_intern,
    major_requirements: cleanText(major, 500),
    apply_link: applyLink || sourceUrl,
    deadline: null,
    deadline_raw: null,
    source_url: sourceUrl,
    source_name: source === 'ncss' ? NCSS_SOURCE.name : YJS_SOURCE.name,
    confidence: String(confidence),
    source_model: 'list_rules',
    source_prompt_version: 'collect_v1',
    status: 'confirmed',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    direction: classification.direction,
    industry: classification.industry,
    industry_source: classification.industry_source,
    company_nature: inferCompanyNature(property, companyName),
    pay: cleanText(pay, 60),
    published_at: publishedAt || null,
    raw_content_id: null,
    additional_sources: '[]',
    edited_fields: '[]',
  };
}

function validJob(job) {
  if (!job.position_title) return false;
  if (job.company === '未识别企业') return false;
  return true;
}

// ---------- ncss ----------

async function harvestNcss(pages, types, sink) {
  for (const jobType of types) {
    for (let page = 1; page <= pages; page += 1) {
      const url = new URL(NCSS_SOURCE.listApi);
      url.searchParams.set('jobType', jobType);
      url.searchParams.set('offset', String(page));
      url.searchParams.set('limit', '20');
      let payload;
      try {
        const text = await pacedFetch(url.toString(), { accept: 'application/json' });
        payload = JSON.parse(text);
      } catch (error) {
        console.error(`  ncss ${jobType} 第 ${page} 页失败：${error.message}`);
        continue;
      }
      const items = payload?.data?.list;
      if (!Array.isArray(items)) {
        console.error(`  ncss ${jobType} 第 ${page} 页缺少岗位列表`);
        continue;
      }
      for (const item of items) {
        const jobId = String(item.jobId || '');
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(jobId)) continue;
        const sourceUrl = NCSS_SOURCE.detailUrl.replace('{jobId}', jobId);
        const low = Number(item.lowMonthPay) || 0;
        const high = Number(item.highMonthPay) || 0;
        const publishedAt = parseSourceDate(item.publishDate);
        sink.add(buildJob({
          id: stableJobId(`ncss:${jobId}`),
          source: 'ncss',
          company: item.recName,
          position: item.jobName,
          location: item.areaCodeName,
          major: item.major,
          tags: item.recTags,
          property: item.recProperty,
          pay: low || high ? `${low || high}K-${high || low}K/月` : null,
          publishedAt,
          applyLink: sourceUrl,
          sourceUrl,
          confidence: 0.55,
          positionType: jobType === '01' ? '校招' : '实习',
        }));
      }
      console.log(`  ncss ${jobType} 第 ${page} 页：${items.length} 条`);
    }
  }
}

// ---------- yjs ----------

function yjsChannels(selection) {
  const all = [];
  const seen = new Set();
  for (const group of MAJOR_GROUPS) {
    for (const major of group.majors) {
      const slug = major[2];
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      all.push({ slug, label: major[0] });
    }
  }
  for (const [slug, label] of YJS_EXTRA_CHANNELS) {
    if (!seen.has(slug)) all.push({ slug, label });
  }
  if (selection === 'all') return all;
  const wanted = new Set(String(selection).split(',').map((item) => item.trim()).filter(Boolean));
  return all.filter((channel) => wanted.has(channel.slug));
}

async function fetchYjsPage(url, channel, sink) {
  let text;
  try {
    text = await pacedFetch(url);
  } catch (error) {
    console.error(`  yjs ${url} 失败：${error.message}`);
    return 0;
  }
  let added = 0;
  for (const row of text.matchAll(YJS_ROW_RE)) {
    const anchor = YJS_ANCHOR_RE.exec(row[1]);
    if (!anchor) continue;
    const path = anchor[1];
    const cells = [...row[1].matchAll(YJS_CELL_RE)].map((cell) => cleanText(cell[1], 300) || '');
    const label = cleanText(anchor[2], 200) || '';
    if (!label) continue;
    const { company, position, cityTag } = splitYjsLabel(label);
    if (!company) continue;
    const positionTitle = position.replace(YJS_YEAR_PREFIX_RE, '').trim();
    if (!positionTitle || YJS_GENERIC_TITLE_RE.test(positionTitle.replace(/\s+/g, ''))) continue;
    if (YJS_CATEGORY_TITLE_RE.test(positionTitle.replace(/\s+/g, ''))) continue;
    const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(cells[3] || '');
    const publishedAt = dateMatch ? `${dateMatch[1]}T00:00:00Z` : null;
    const sourceUrl = `https://www.yingjiesheng.com/${path}`;
    const job = buildJob({
      id: stableJobId(`yjs:${path}`),
      source: 'yjs',
      company,
      position: positionTitle,
      location: cells[1] || cityTag,
      major: channel.label,
      tags: cells[2] || null,
      pay: null,
      publishedAt,
      applyLink: sourceUrl,
      sourceUrl,
      confidence: 0.4,
    });
    if (sink.add(job)) added += 1;
  }
  return added;
}

async function harvestYjs(channels, withCities, sink) {
  for (const channel of channels) {
    const urls = [`${YJS_SOURCE.baseUrl}/major/${channel.slug}/`];
    if (withCities) {
      for (const city of YJS_CITIES) urls.push(`${YJS_SOURCE.baseUrl}/major/${channel.slug}/${city}/`);
    }
    let added = 0;
    for (const url of urls) added += await fetchYjsPage(url, channel, sink);
    console.log(`  yjs ${channel.label}（${channel.slug}）：新增 ${added} 条`);
  }
}

// ---------- 去重与合并 ----------

function dedupeKey(job) {
  const position = job.position_title.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  const location = String(job.location || '').normalize('NFKC').replace(/\s+/g, '');
  return `${companyKey(job.company)}|${position}|${location}`;
}

function mergeJob(base, extra) {
  const sources = new Set(JSON.parse(base.additional_sources || '[]'));
  if (extra.source_name !== base.source_name) sources.add(extra.source_name);
  base.additional_sources = JSON.stringify([...sources]);
  if (!base.pay && extra.pay) base.pay = extra.pay;
  if (!base.published_at && extra.published_at) base.published_at = extra.published_at;
  if ((!base.industry || base.industry === '其他') && extra.industry) base.industry = extra.industry;
  if ((!base.direction || base.direction === '其他') && extra.direction) base.direction = extra.direction;
  if (Number(extra.confidence) > Number(base.confidence)) {
    base.location = base.location || extra.location;
    base.major_requirements = base.major_requirements || extra.major_requirements;
    base.company_nature = base.company_nature || extra.company_nature;
    base.confidence = extra.confidence;
  }
}

export function createSink() {
  const byUrl = new Map();
  const byKey = new Map();
  return {
    add(job) {
      if (!validJob(job)) return false;
      if (byUrl.has(job.source_url)) return false;
      const key = dedupeKey(job);
      const existing = byKey.get(key);
      if (existing) {
        mergeJob(existing, job);
        byUrl.set(job.source_url, existing);
        return false;
      }
      byKey.set(key, job);
      byUrl.set(job.source_url, job);
      return true;
    },
    values() {
      return [...byKey.values()];
    },
  };
}

export function summarize(jobs) {
  const companies = new Map();
  const directions = {};
  const industries = {};
  const positionTypes = {};
  const bySource = {};
  const coverage = { pay: 0, deadline: 0, publishedAt: 0, major: 0, direction: 0, industry: 0, companyNature: 0 };
  let minDate = null;
  let maxDate = null;
  for (const job of jobs) {
    const key = companyKey(job.company);
    const entry = companies.get(key) || { name: job.company, count: 0, directions: new Set(), locations: new Set() };
    entry.count += 1;
    if (job.direction) entry.directions.add(job.direction);
    if (job.location) entry.locations.add(job.location);
    companies.set(key, entry);
    directions[job.direction || '其他'] = (directions[job.direction || '其他'] || 0) + 1;
    industries[job.industry || '其他'] = (industries[job.industry || '其他'] || 0) + 1;
    positionTypes[job.position_type || '未知'] = (positionTypes[job.position_type || '未知'] || 0) + 1;
    bySource[job.source_name] = (bySource[job.source_name] || 0) + 1;
    if (job.pay) coverage.pay += 1;
    if (job.deadline) coverage.deadline += 1;
    if (job.published_at) coverage.publishedAt += 1;
    if (job.major_requirements) coverage.major += 1;
    if (job.direction && job.direction !== '其他') coverage.direction += 1;
    if (job.industry && job.industry !== '其他') coverage.industry += 1;
    if (job.company_nature) coverage.companyNature += 1;
    if (job.published_at) {
      if (!minDate || job.published_at < minDate) minDate = job.published_at;
      if (!maxDate || job.published_at > maxDate) maxDate = job.published_at;
    }
  }
  const sortCount = (record) => Object.entries(record).sort((a, b) => b[1] - a[1]);
  return {
    total: jobs.length,
    companies: companies.size,
    bySource,
    positionTypes,
    coverage,
    coverageRates: Object.fromEntries(Object.entries(coverage).map(([key, value]) => [
      key, jobs.length ? Number((value / jobs.length * 100).toFixed(1)) : 0,
    ])),
    directions: sortCount(directions).slice(0, 15),
    industries: sortCount(industries).slice(0, 15),
    topCompanies: [...companies.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
      .map((entry) => ({
        name: entry.name,
        count: entry.count,
        directions: [...entry.directions].slice(0, 4),
        locations: [...entry.locations].slice(0, 3),
      })),
    publishedRange: { min: minDate, max: maxDate },
  };
}

// ---------- 导入 ----------

async function importJobs(base, jobs) {
  const endpoint = `${base.replace(/\/+$/, '')}/functions/v1/app/api/admin/import`;
  const origin = new URL(base).origin;
  const chunkSize = 60;
  let imported = 0;
  for (let index = 0; index < jobs.length; index += chunkSize) {
    const chunk = jobs.slice(index, index + chunkSize);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, referer: `${origin}/` },
      body: JSON.stringify({ internships: chunk }),
      signal: AbortSignal.timeout(120000),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`导入失败（HTTP ${response.status}）：${text.slice(0, 300)}`);
    }
    imported += chunk.length;
    if (imported % 300 === 0 || imported === jobs.length) {
      console.log(`  已导入 ${imported}/${jobs.length}`);
    }
  }
  return imported;
}

// ---------- 主流程 ----------

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (options.from) {
    const inputPath = resolve(ROOT, options.from);
    const payload = JSON.parse(await readFile(inputPath, 'utf8'));
    const jobs = Array.isArray(payload) ? payload : payload.jobs;
    if (!Array.isArray(jobs) || !jobs.length) throw new Error('导入文件缺少 jobs 数组。');
    console.log(`读取 ${inputPath}：${jobs.length} 条`);
    if (!options.commit) {
      console.log('未加 --commit，仅校验文件。');
      return;
    }
    const imported = await importJobs(options.base, jobs);
    console.log(`导入完成：${imported} 条（重复 ID 由服务端忽略）。`);
    return;
  }
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const outputPath = resolve(ROOT, options.out || `data/prefill-${stamp}.json`);

  console.log('InternRadar 初次预填充（规则解析，不调用 LLM）');
  console.log(`模式：${options.commit ? 'commit（导入线上库）' : 'dry-run（只生成本地 JSON）'}`);
  console.log(`ncss 页数：${options.ncssPages}；应届生频道：${options.yjsChannels}；城市子频道：${options.cities ? '抓取' : '跳过'}`);
  console.log('');

  const sink = createSink();

  const ncssTypes = String(options.ncssTypes || '03').split(',').map((type) => type.trim()).filter((type) => /^0[1-4]$/.test(type));
  if (options.ncssPages > 0 && ncssTypes.length) {
    console.log(`采集 ncss（类型 ${ncssTypes.join(',')}）…`);
    await harvestNcss(options.ncssPages, ncssTypes, sink);
  }
  const channels = yjsChannels(options.yjsChannels);
  if (channels.length) {
    console.log(`采集应届生 ${channels.length} 个专业频道…`);
    await harvestYjs(channels, options.cities, sink);
  }

  const jobs = sink.values()
    .filter((job) => isFresh(job.published_at, options.maxAgeDays))
    .sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));
  const stats = summarize(jobs);

  const payload = {
    generatedAt: new Date().toISOString(),
    options: { ...options, commit: undefined },
    requests,
    stats,
    jobs,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');

  console.log('');
  console.log('采集完成');
  console.log(`  岗位：${stats.total} 条；企业：${stats.companies} 家；请求：${requests.total} 次（失败 ${requests.failed}，拦截 ${requests.blocked}）`);
  console.log(`  来源：${Object.entries(stats.bySource).map(([name, count]) => `${name} ${count}`).join('；')}`);
  console.log(`  字段覆盖率：薪资 ${stats.coverageRates.pay}%；发布时间 ${stats.coverageRates.publishedAt}%；截止 ${stats.coverageRates.deadline}%；专业 ${stats.coverageRates.major}%`);
  console.log(`  方向可识别 ${stats.coverageRates.direction}%；行业可识别 ${stats.coverageRates.industry}%`);
  console.log(`  岗位类型：${Object.entries(stats.positionTypes).map(([name, count]) => `${name} ${count}`).join('；')}`);
  console.log(`  输出：${outputPath}`);

  if (options.commit) {
    console.log('');
    console.log('开始导入线上库…');
    const imported = await importJobs(options.base, jobs);
    console.log(`导入完成：${imported} 条（重复 ID 会由服务端忽略）。`);
  } else {
    console.log('\n预览完成。确认无误后加 --commit 导入线上库。');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`预填充失败：${error?.message || error}`);
    process.exitCode = 1;
  });
}
