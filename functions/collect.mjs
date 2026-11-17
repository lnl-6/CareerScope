// 模块一/二（站点版）：按「专业 + 方向 + 意向」条件抓取公开岗位列表，
// 详情可抓的来源走 LLM 解析，只用列表字段的来源走规则解析（置信度偏低），统一进入待确认队列。
import {
  COLLECT_CITIES, COMPANY_NATURE_VALUES, DIRECTIONS, INDUSTRIES,
  PARSE_TEXT_MAX_CHARS, cityMeta, inferCompanyNature, inferPositionType,
  classifyJob, isoSeconds, majorMeta, parseSourceDate, siteLlmModel, siteLlmStatus, stripHtmlText, uuid, yjsMajorDir,
  canonicalSourceName, jobDedupeKey, mergeLocations, cleanPositionTitle, refineCityFromTitle,
} from './core.mjs';
import { DB_MAX_ROWS, claimCollectLlmCall, dbRows, loadInternships, mapInternship, parseJson } from './store.mjs';

// 公开渠道类别：官方平台 / 高校就业网 / 政府与国企公告 / 企业官网。
export const SOURCE_CATEGORIES = [
  { id: 'official', label: '官方招聘平台' },
  { id: 'campus', label: '高校就业信息网' },
  { id: 'gov', label: '政府与国企公开公告' },
  { id: 'company', label: '企业官网招聘页' },
];

const SOURCE_CATEGORY_IDS = SOURCE_CATEGORIES.map((entry) => entry.id);

// 内置公开数据源；用户自定义公开渠道存在 sources 表中，kind = 'generic'。
export const BUILTIN_SOURCES = [
  {
    id: 'ncss',
    kind: 'ncss',
    category: 'official',
    name: '国家大学生就业服务平台',
    baseUrl: 'https://newjob.ncss.cn',
    listUrl: 'https://newjob.ncss.cn/student/jobs/internindex.html',
    listApi: 'https://newjob.ncss.cn/student/jobs/jobslist/ajax/',
    detailUrl: 'https://newjob.ncss.cn/student/jobs/{jobId}/detail.html',
    detailFetchable: false,
    crawlIntervalMin: 240,
    notes: '教育部全国大学生就业公共服务平台，公开实习岗位列表（jobType=03），只解析列表字段，不抓详情页、不调用 LLM。',
    enabled: true,
    custom: false,
  },
  {
    id: 'yjs',
    kind: 'yjs',
    category: 'official',
    name: '应届生求职网',
    baseUrl: 'https://www.yingjiesheng.com',
    listUrl: 'https://www.yingjiesheng.com/major/',
    detailUrl: 'https://www.yingjiesheng.com/{path}',
    detailFetchable: false,
    crawlIntervalMin: 240,
    notes: '公开列表页（GBK 编码）。详情页有反爬拦截，因此只用列表字段解析，置信度偏低。',
    enabled: true,
    custom: false,
  },
  {
    id: 'guopin',
    kind: 'guopin',
    category: 'official',
    name: '国聘',
    baseUrl: 'https://www.iguopin.com',
    listUrl: 'https://www.iguopin.com/job',
    listApi: 'https://gp-api.iguopin.com/api/jobs/v1/list',
    detailUrl: 'https://www.iguopin.com/job/detail?id={jobId}',
    detailFetchable: false,
    crawlIntervalMin: 240,
    notes: '国资央企招聘平台公开岗位接口，只取校招与实习；列表已带职位正文、截止时间、地点与单位性质，不抓详情页。',
    enabled: true,
    custom: false,
  },
];

const USER_AGENT = 'InternRadar/1.0 (+COMPLIANCE.md)';
const FETCH_TIMEOUT_MS = 15000;
const MIN_INTERVAL_MS = 1000;
const JITTER_MAX_MS = 500;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const LIST_PAGE_SIZE = 10;
// 「一次采集不少于 20 条」：单次运行每源可入队 60 条，必要时自动翻页补足目标数。
const MAX_QUEUE_PER_RUN = 60;
const MAX_PAGES_PER_RUN = 6;
const LIST_ONLY_CONFIDENCE = 0.3;
const CAPTCHA_MARKERS = ['验证码', '人机验证', '滑动验证', '访问过于频繁', 'IP 限制', '请求过于频繁'];
const WAF_MARKERS = ['aliyun_waf', 'acw_sc__', 'waf_js', 'renderData'];

const lastRequestByDomain = new Map();
const robotsCache = new Map();

const COLLECT_PROMPT = `你是一个实习岗位信息抽取助手。请从给定的网页纯文本中抽取岗位信息，严格输出一个 JSON 对象，不要输出任何解释或其他内容。

输出字段约定（字段缺失填 null，不允许缺失字段本身）：
{
  "company": "string|null",
  "position": "string|null",
  "location": "string|null",
  "position_type": "实习|校招|社招|null",
  "is_intern": true|false|null,
  "major_requirements": "string|null",
  "apply_link": "string|null",
  "deadline": "YYYY-MM-DD|null",
  "deadline_raw": "string|null",
  "direction": "{{directions}}",
  "industry": "{{industries}}",
  "company_nature": "外企|国企|民企|事业单位|null",
  "confidence": 0.0
}

规则：
1. position_type 只能取「实习」「校招」「社招」之一，无法判断填 null；is_intern 根据上下文判断。
2. direction 从职能方向列表中选择最匹配的一项，无法判断填「其他」。
3. industry 从行业列表中选择最匹配的一项，无法判断填「其他」。
4. company_nature 根据公司名称与描述推断，无法判断填 null。
5. 截止日期：绝对日期转为 YYYY-MM-DD 填入 deadline；相对日期填入 deadline_raw 并将 deadline 置 null；无明确截止则均为 null。
6. major_requirements 摘录专业要求原文；apply_link 为投递链接、邮箱或表单地址。
7. confidence 为整体把握，0.0–1.0；company 与 position 均无法抽取时置 0.0。
{{criteria}}
网页纯文本内容：
{{content}}`;

function collectError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.expose = true;
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sourceDomain(source) {
  try {
    return new URL(source.baseUrl).hostname;
  } catch {
    return '';
  }
}

// ---------- 数据源（内置 + 用户自定义公开渠道） ----------

function mapSourceRow(row) {
  return {
    id: row.id,
    kind: row.kind || 'generic',
    category: SOURCE_CATEGORY_IDS.includes(row.category) ? row.category : 'company',
    name: row.name,
    baseUrl: row.base_url,
    listUrl: row.list_url,
    detailUrl: row.detail_url || null,
    detailFetchable: false,
    crawlIntervalMin: Number(row.crawl_interval_min) || 240,
    notes: row.notes || '用户添加的公开渠道，按列表页链接采集，只用列表字段解析。',
    enabled: row.enabled !== '0' && row.enabled !== false,
    custom: true,
  };
}

export async function loadSources(db) {
  let custom = [];
  try {
    custom = dbRows(await db.from('sources').select('*').order('created_at', { ascending: false }).limit(100))
      .map(mapSourceRow);
  } catch {
    // sources 表尚未创建时只用内置源
  }
  return [...BUILTIN_SOURCES, ...custom];
}

async function getSource(db, sourceId, fetcher = fetch) {
  const sources = await loadSources(db);
  const source = sources.find((item) => item.id === sourceId && item.enabled);
  if (!source) throw collectError(404, 'source_not_found', '采集数据源不存在或未启用。');
  return source;
}

// ---------- 合规抓取 ----------

async function paceDomain(db, domain) {
  let last = lastRequestByDomain.get(domain) || 0;
  try {
    const rows = dbRows(
      await db.from('crawl_logs')
        .select('fetched_at')
        .eq('domain', domain)
        .order('fetched_at', { ascending: false })
        .limit(1),
    );
    if (rows[0]?.fetched_at) last = Math.max(last, Date.parse(rows[0].fetched_at) || 0);
  } catch {
    // 采集日志不可用时仍按进程内限流执行
  }
  const wait = MIN_INTERVAL_MS + Math.random() * JITTER_MAX_MS - (Date.now() - last);
  if (wait > 0) await sleep(wait);
}

async function logCrawl(db, { source, url, status, outcome, message }) {
  const domain = new URL(url).hostname;
  lastRequestByDomain.set(domain, Date.now());
  try {
    await db.from('crawl_logs').insert({
      id: uuid(),
      source_name: canonicalSourceName(source.name),
      domain,
      url,
      http_status: status ?? null,
      outcome,
      message: message ?? null,
      fetched_at: isoSeconds(new Date()),
    }).select('id');
  } catch {
    // 日志写入失败不阻塞采集
  }
}

async function ensureRobots(db, source, fetcher = fetch) {
  const cached = robotsCache.get(source.baseUrl);
  if (cached) return cached;
  const url = `${source.baseUrl}/robots.txt`;
  let robots = { allowAll: true, disallow: [], status: '无 robots.txt' };
  try {
    await paceDomain(db, sourceDomain(source));
    const response = await fetcher(url, {
      headers: { 'user-agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const text = await response.text();
    await logCrawl(db, {
      source, url, status: response.status, outcome: response.ok ? 'robots_ok' : 'robots_absent',
    });
    if (response.ok && !/^\s*</.test(text)) {
      const disallow = [];
      let applies = false;
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.split('#')[0].trim();
        if (!line) continue;
        const [rawKey, ...rest] = line.split(':');
        const key = rawKey.trim().toLowerCase();
        const value = rest.join(':').trim();
        if (key === 'user-agent') applies = value === '*';
        else if (applies && key === 'disallow' && value) disallow.push(value);
        else if (applies && key === 'allow' && value === '/') disallow.length = 0;
      }
      robots = { allowAll: disallow.length === 0, disallow, status: '已遵守' };
    }
  } catch {
    // 无法读取 robots.txt 时按允许访问处理，并记录状态
  }
  robotsCache.set(source.baseUrl, robots);
  return robots;
}

function robotsAllows(robots, path) {
  if (robots.allowAll) return true;
  return !robots.disallow.some((prefix) => path.startsWith(prefix));
}

// 公开页常见 GBK/GB2312：先按 UTF-8 严格解码，失败再按 GBK 重试。
// 宽松 UTF-8 解码会把 GBK 字节替换成 U+FFFD，无法靠"是否含中文"判断。
function decodeBuffer(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // 不是合法 UTF-8，继续尝试 GBK
  }
  try {
    return new TextDecoder('gbk').decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

async function fetchRaw(db, source, url, {
  accept = 'text/html,application/json;q=0.9,*/*;q=0.8', fetcher = fetch,
  method = 'GET', body = null, headers = {},
} = {}) {
  const robots = await ensureRobots(db, source, fetcher);
  const path = new URL(url).pathname;
  if (!robotsAllows(robots, path)) {
    await logCrawl(db, { source, url, status: null, outcome: 'robots_skip', message: 'robots.txt 不允许访问' });
    throw collectError(409, 'robots_disallowed', `robots.txt 不允许访问：${path}`);
  }
  await paceDomain(db, sourceDomain(source));
  let response;
  try {
    response = await fetcher(url, {
      method,
      headers: {
        'user-agent': USER_AGENT,
        accept,
        'accept-language': 'zh-CN,zh;q=0.9',
        ...headers,
      },
      body,
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    await logCrawl(db, { source, url, status: null, outcome: 'failed', message: error.message });
    throw collectError(502, 'source_unreachable', '数据源请求超时或不可达，请稍后重试。');
  }
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_RESPONSE_BYTES) {
    await logCrawl(db, { source, url, status: response.status, outcome: 'too_large', message: '响应体过大' });
    throw collectError(502, 'source_too_large', '数据源返回内容过大，已停止抓取。');
  }
  const text = typeof response.arrayBuffer === 'function'
    ? decodeBuffer(await response.arrayBuffer())
    : await response.text();
  const head = text.slice(0, 8000);
  const blocked = response.status === 403 || response.status === 503
    || CAPTCHA_MARKERS.some((marker) => head.includes(marker))
    || WAF_MARKERS.some((marker) => head.includes(marker));
  await logCrawl(db, {
    source,
    url,
    status: response.status,
    outcome: blocked ? 'anti_crawl' : response.ok ? 'success' : 'failed',
    message: blocked ? '命中反爬或验证拦截，未绕过' : null,
  });
  if (blocked) {
    throw collectError(503, 'anti_crawl_blocked', '数据源触发反爬或验证拦截，本次已跳过且不绕过。');
  }
  if (!response.ok) {
    throw collectError(502, 'source_http_error', `数据源返回 HTTP ${response.status}。`);
  }
  return { response, text, url: response.url || url };
}

async function fetchText(db, source, url, { minBytes = 1024, fetcher = fetch } = {}) {
  const { response, text, url: finalUrl } = await fetchRaw(db, source, url, { fetcher });
  if (text.length < minBytes) {
    throw collectError(502, 'source_empty', '数据源返回内容过少，已跳过。');
  }
  return { text, status: response.status, url: finalUrl };
}

// ---------- 采集条件 ----------

function normalizeList(value, max = 12) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(/[,，、|]/);
  return [...new Set(raw.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, max);
}

export function normalizeCriteria(input = {}) {
  const majors = normalizeList(input.majors, 8).filter((name) => majorMeta(name));
  const directions = normalizeList(input.directions, 8).filter((name) => DIRECTIONS.includes(name));
  const industries = normalizeList(input.industries, 8).filter((name) => INDUSTRIES.includes(name));
  const positionKeywords = normalizeList(input.positionKeywords, 6);
  const city = String(input.city || '').trim().slice(0, 20);
  const majorText = String(input.majorText || '').trim().slice(0, 60);
  const remote = /远程|居家|不限/.test(city) ? true : /远程|居家/.test(majorText);
  const publishedWithinDays = [0, 3, 7, 14, 30].includes(Number(input.publishedWithinDays))
    ? Number(input.publishedWithinDays) : 7;
  return {
    majors,
    directions,
    industries,
    positionKeywords,
    city,
    cityInfo: city ? cityMeta(city) : null,
    majorText,
    remote,
    publishedWithinDays,
    openOnly: input.openOnly === undefined ? true : Boolean(input.openOnly),
  };
}

// 岗位文本是否命中条件（任一维度为空即视为不限）。
function matchesCriteria(criteria, item) {
  const title = `${item.position || ''} ${item.major || ''} ${item.summary || ''}`;
  const classification = classifyJob({
    company: item.company,
    position: item.position,
    majorRequirements: item.major,
    sourceIndustry: item.industry || null,
  });
  if (criteria.directions.length && !criteria.directions.includes(classification.direction)) return false;
  if (criteria.industries.length && !criteria.industries.includes(classification.industry)) return false;
  if (criteria.positionKeywords.length
    && !criteria.positionKeywords.some((keyword) => title.toLowerCase().includes(keyword.toLowerCase()))) return false;
  if (criteria.city && !criteria.remote) {
    const location = `${item.location || ''} ${item.city || ''}`;
    const name = criteria.cityInfo?.name || criteria.city.replace(/市$/, '');
    if (!location.includes(name) && !/远程|居家/.test(location)) return false;
  }
  if (criteria.majors.length || criteria.majorText) {
    const majorField = `${item.major || ''}`;
    const hit = criteria.majors.some((name) => (majorMeta(name)?.terms || []).some((term) => majorField.includes(term)))
      || (criteria.majorText && majorField.includes(criteria.majorText))
      || /不限|所有专业|各专业|专业不限制/.test(majorField)
      || (!majorField && criteria.majors.some((name) => (majorMeta(name)?.terms || []).some((term) => title.includes(term))));
    if (!hit) return false;
  }
  return true;
}

function isStalePublished(item, days) {
  if (!days) return false;
  const published = Date.parse(item.publishedAt || '');
  if (Number.isNaN(published)) return false;
  return published < Date.now() - days * 86400000;
}

function isClosedDeadline(item) {
  const deadline = String(item.deadline || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(deadline)) return false;
  return deadline.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

function searchTermsFor(criteria) {
  // 来源站的 jobName 是标题精确匹配，实习岗位池本身很小，
  // 用方向词做服务端过滤会稳定返回 0 条，因此只透传用户手填的岗位关键词。
  return [...new Set(criteria.positionKeywords)].slice(0, 3);
}

// ---------- 列表适配器 ----------

function ncssItemSummary(item) {
  const publishedAt = parseSourceDate(item.publishDate);
  const low = Number(item.lowMonthPay) || 0;
  const high = Number(item.highMonthPay) || 0;
  return {
    company: item.recName || '',
    position: item.jobName || '',
    location: item.areaCodeName || null,
    major: item.major || null,
    degree: item.degreeName || null,
    property: item.recProperty || null,
    headCount: item.headCount ?? null,
    pay: low || high
      ? `${low || high}K-${high || low}K/月`
      : null,
    tags: item.recTags || null,
    scale: item.recScale || null,
    positionType: '实习',
    publishedAt,
  };
}

async function fetchNcssList(db, source, criteria, page, fetcher) {
  const apiUrl = new URL(source.listApi);
  const terms = searchTermsFor(criteria);
  const params = {
    jobType: '03',
    areaCode: criteria.cityInfo?.areaCode || '',
    jobName: terms[0] || '',
    monthPay: '', industrySectors: '', property: '', categoryCode: '', memberLevel: '',
    recruitType: '', offset: String(page), limit: '20', keyUnits: '',
    degreeCode: '', sourcesName: '0', sourcesType: '',
  };
  for (const [key, value] of Object.entries(params)) apiUrl.searchParams.set(key, value);
  const { text } = await fetchRaw(db, source, apiUrl.toString(), { accept: 'application/json', fetcher });
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw collectError(502, 'source_response_invalid', '数据源返回格式无法解析。');
  }
  const items = payload?.data?.list;
  if (!Array.isArray(items)) throw collectError(502, 'source_response_invalid', '数据源返回内容缺少岗位列表。');
  return {
    items: items.map((item) => ({
      key: String(item.jobId || ''),
      detailUrl: item.jobId ? source.detailUrl.replace('{jobId}', String(item.jobId)) : null,
      summary: ncssItemSummary(item),
      jobId: item.jobId,
    })).filter((item) => /^[A-Za-z0-9_-]{1,64}$/.test(String(item.jobId || ''))),
    // pagenation.total 随 limit 变化（是分页数而非记录数），不提供可信的来源总数。
    total: null,
    requestUrl: apiUrl.toString(),
  };
}

function yjsListUrl(source, criteria, page, withCity) {
  const dir = yjsMajorDir(criteria.majors[0]);
  const slug = withCity && criteria.cityInfo && criteria.cityInfo.yjs !== 'other'
    ? `/${criteria.cityInfo.yjs}` : '';
  const pageNumber = Math.max(1, Number(page) || 1);
  const pageFile = pageNumber > 1 ? `list_${pageNumber}.html` : '';
  return `${source.baseUrl}/major/${dir}${slug}/${pageFile}`;
}

const YJS_ROW_RE = /<tr[^>]*class="jobli"[^>]*>([\s\S]*?)<\/tr>/gi;
const YJS_CELL_RE = /<td[^>]*>([\s\S]*?)<\/td>/gi;
const YJS_ANCHOR_RE = /<a[^>]+href=["'](?:https?:)?\/\/(?:www\.)?yingjiesheng\.com\/(job-\d{3}-\d{3}-\d{3}\.html)["'][^>]*>([\s\S]*?)<\/a>/i;
const YJS_BRACKET_RE = /^\[([^\]]{1,24})\]\s*/;
const YJS_COMPANY_RE = /(公司|集团|银行|证券|基金|保险|事务所|研究院|研究所|大学|学院|医院|中心|机构|出版社|协会|学会|厂)$/;
const YJS_TOTAL_RE = /共\s*(\d+)\s*条/;

// 列表标题格式：「[城市范围]公司全称 岗位名」；公司名可能缺失，此时只保留岗位标题。
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

async function fetchYjsList(db, source, criteria, page, fetcher, channel = criteria.majors[0]) {
  const channelCriteria = { ...criteria, majors: channel ? [channel] : [] };
  const url = yjsListUrl(source, channelCriteria, page, true);
  const { text } = await fetchText(db, source, url, { minBytes: 512, fetcher });
  const html = text;
  const items = [];
  const seen = new Set();
  for (const row of html.matchAll(YJS_ROW_RE)) {
    const anchor = YJS_ANCHOR_RE.exec(row[1]);
    if (!anchor) continue;
    const path = anchor[1];
    if (seen.has(path)) continue;
    seen.add(path);
    const cells = [...row[1].matchAll(YJS_CELL_RE)]
      .map((cell) => stripHtmlText(cell[1]).replace(/\s+/g, ' ').trim());
    const label = stripHtmlText(anchor[2]).replace(/\s+/g, ' ').trim();
    if (!label) continue;
    const { company, position, cityTag } = splitYjsLabel(label);
    // 第二列是「工作地点」，形如 北京,天津,河北,...
    const location = (cells[1] || '').replace(/[,.…]{2,}\s*$/, '').trim() || cityTag || null;
    const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(cells[3] || '');
    items.push({
      key: path,
      detailUrl: `https://www.yingjiesheng.com/${path}`,
      summary: {
        company,
        position: position.slice(0, 120),
        location,
        major: channel || null,
        channel: cells[2] || null,
        tags: cells[2] || null,
        positionType: inferPositionType(position),
        applyLink: `https://www.yingjiesheng.com/${path}`,
        publishedAt: dateMatch ? `${dateMatch[1]}T00:00:00Z` : null,
      },
    });
    if (items.length >= LIST_PAGE_SIZE * 2) break;
  }
  const totalMatch = YJS_TOTAL_RE.exec(html);
  return {
    items,
    total: totalMatch ? Number(totalMatch[1]) : null,
    requestUrl: url,
  };
}

const GUOPIN_NATURE = ['115xW5oQ', '11bTac9'];
const GUOPIN_INDUSTRY_RULES = [
  [/(软件|信息技术|互联网|数据服务)/, '互联网/软件'],
  [/人工智能/, '人工智能'],
  [/(电子|半导体|集成电路|通信设备)/, '电子/半导体'],
  [/(银行|货币金融)/, '银行'],
  [/(证券|基金|资本市场|期货)/, '证券/基金'],
  [/保险/, '保险'],
  [/(金融|信托|租赁)/, '金融'],
  [/(汽车|整车)/, '汽车'],
  [/(医药|制药|医疗|卫生)/, '医药/医疗'],
  [/(生物|基因)/, '生物科技'],
  [/教育/, '教育培训'],
  [/(传媒|新闻|出版|广播|影视|文化|艺术)/, '文化传媒'],
  [/(广告|公关)/, '广告/公关'],
  [/(咨询|商务服务)/, '咨询'],
  [/(建筑|房地产|土木|装饰|安装)/, '建筑/地产'],
  [/(施工|工程|勘察|设计院)/, '工程承包'],
  [/(物流|运输|仓储|邮政|航空|铁路|道路)/, '交通/物流'],
  [/(旅游|酒店|住宿|景区)/, '旅游/酒店'],
  [/餐饮/, '餐饮'],
  [/(零售|批发|消费|商贸|贸易)/, '消费/零售'],
  [/电商/, '电商'],
  [/(食品|饮料|酒|茶)/, '食品'],
  [/(农业|林业|畜牧|渔业|农副)/, '农业'],
  [/(电力|热力|燃气|水生产|能源|石油|天然气|煤炭|采矿)/, '能源/电力'],
  [/(化工|化学)/, '化工'],
  [/(材料|冶炼|金属|矿物|非金属)/, '材料'],
  [/(制造|设备|机械|仪器|电气|修理|加工)/, '制造'],
  [/(公共管理|国家机构|公共设施|政府)/, '公共部门'],
  [/(社会团体|社会组织|群众团体|社会工作)/, '社会组织'],
  [/物业/, '房地产服务'],
];

function guopinIndustry(value) {
  const text = String(value || '').trim();
  if (!text || text === '其他') return null;
  if (INDUSTRIES.includes(text)) return text;
  return GUOPIN_INDUSTRY_RULES.find(([pattern]) => pattern.test(text))?.[1] || null;
}

function guopinDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return parseSourceDate(text.includes('T') ? text : `${text.replace(' ', 'T')}+08:00`);
}

function guopinCity(district) {
  const label = String(district?.area_cn || '').trim();
  if (!label) return null;
  const parts = label.split('-').filter(Boolean);
  return (parts[0] === '中国' ? parts[1] : parts[0]) || null;
}

function guopinPay(item) {
  const min = Number(item.min_wage) || 0;
  const max = Number(item.max_wage) || 0;
  if (item.is_negotiable || (!min && !max)) return null;
  const unit = String(item.wage_unit_cn || '').trim();
  const range = min && max ? (min === max ? `${min}` : `${min}-${max}`) : `${min || max}`;
  return `${range}${unit}`;
}

function guopinSummary(item) {
  const company = item.company_info || {};
  const cities = [...new Set((item.district_list || []).map(guopinCity).filter(Boolean))];
  const industry = guopinIndustry(company.industry_cn);
  return {
    company: item.company_name || '',
    position: item.job_name || '',
    location: cities.join('、') || null,
    degree: item.education_cn || null,
    property: company.nature_cn || null,
    scale: company.scale_cn || null,
    pay: guopinPay(item),
    tags: [item.category_cn, item.experience_cn, company.scale_cn].filter(Boolean).join(' ') || null,
    industry,
    positionType: item.nature_cn || null,
    publishedAt: guopinDate(item.start_time || item.refresh_time || item.update_time),
    deadline: guopinDate(item.end_time)?.slice(0, 10) || null,
    deadlineRaw: item.end_time || null,
    description: item.contents || '',
    summary: [item.category_cn, item.experience_cn].filter(Boolean).join(' ') || null,
  };
}

async function fetchGuopinList(db, source, criteria, page, fetcher) {
  const pageNumber = Math.max(1, Number(page) || 1);
  const body = JSON.stringify({
    page: pageNumber,
    page_size: LIST_PAGE_SIZE * 5,
    nature: GUOPIN_NATURE,
  });
  const { text } = await fetchRaw(db, source, source.listApi, {
    accept: 'application/json',
    fetcher,
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  });
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw collectError(502, 'source_response_invalid', '数据源返回格式无法解析。');
  }
  const items = payload?.data?.list;
  if (!Array.isArray(items)) throw collectError(502, 'source_response_invalid', '数据源返回内容缺少岗位列表。');
  return {
    items: items.map((item) => ({
      key: `guopin:${item.job_id}`,
      detailUrl: item.job_id ? source.detailUrl.replace('{jobId}', String(item.job_id)) : null,
      summary: guopinSummary(item),
      jobId: item.job_id,
    })).filter((item) => /^[A-Za-z0-9_-]{1,64}$/.test(String(item.jobId || '')) && item.summary.position),
    total: Number(payload?.data?.total) || null,
    requestUrl: `${source.listApi}?page=${pageNumber}`,
  };
}

const GENERIC_LINK_RE = /(job|position|recruit|zhaopin|post|vacancy|tw|zp|article|content|news|info)/i;
const GENERIC_TEXT_RE = /(实习|校招|招聘|岗位|网申|储备|管培|应届|campus|intern)/i;

async function fetchGenericList(db, source, criteria, page, fetcher) {
  void page;
  const url = source.listUrl;
  const { text } = await fetchText(db, source, url, { minBytes: 512, fetcher });
  const html = text;
  const base = new URL(url);
  const anchorRe = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi;
  const items = [];
  const seen = new Set();
  let match;
  while ((match = anchorRe.exec(html)) !== null) {
    const label = stripHtmlText(match[2]).replace(/\s+/g, ' ').trim();
    if (!label || label.length < 6 || label.length > 120) continue;
    if (!GENERIC_TEXT_RE.test(label)) continue;
    let href;
    try {
      href = new URL(match[1], `${base.origin}${base.pathname}`).toString();
    } catch {
      continue;
    }
    if (href.startsWith('mailto:') || href.startsWith('javascript:')) continue;
    if (new URL(href).hostname !== base.hostname) continue;
    if (!GENERIC_LINK_RE.test(href) && !GENERIC_TEXT_RE.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    items.push({
      key: href,
      detailUrl: href,
      summary: {
        company: '',
        position: label,
        location: null,
        major: criteria.majors[0] || null,
        publishedAt: null,
      },
    });
    if (items.length >= LIST_PAGE_SIZE * 2) break;
  }
  return { items, total: null, requestUrl: url };
}

async function fetchSourceList(db, source, criteria, page, fetcher) {
  if (source.kind === 'ncss') return fetchNcssList(db, source, criteria, page, fetcher);
  if (source.kind === 'yjs') return fetchYjsList(db, source, criteria, page, fetcher);
  if (source.kind === 'guopin') return fetchGuopinList(db, source, criteria, page, fetcher);
  return fetchGenericList(db, source, criteria, page, fetcher);
}

// ---------- 入库 ----------

async function buildKnownChecker(db) {
  const knownUrls = new Set();
  return {
    isKnown: async (url) => {
      if (!url) return false;
      if (knownUrls.has(url)) return true;
      const raw = dbRows(await db.from('raw_contents').select('id').eq('source_url', url).limit(1));
      const job = dbRows(await db.from('internships').select('id').eq('source_url', url).limit(1));
      if (raw.length || job.length) {
        knownUrls.add(url);
        return true;
      }
      return false;
    },
    remember: (url) => { if (url) knownUrls.add(url); },
  };
}

const COMPANY_RE = /([\u4e00-\u9fa5A-Za-z0-9（）()·]{2,40}(?:股份有限公司|有限责任公司|集团有限公司|有限公司|集团|公司|研究院|研究所|学院|大学|中心|银行|医院))/;
const MAJOR_RE = /(?:专业要求|专业|面向专业)[：:\s]*([^。；;\n]{2,80})/;
const DEADLINE_RE = /(?:截止|报名|申请|投递)[^。；\n]{0,30}?(20\d{2})\s*[年\/.-]\s*(\d{1,2})\s*[月\/.-]\s*(\d{1,2})/;

// LLM 不可用或详情页抓取失败时，从详情正文里用规则兜底抽取，避免整条岗位解析失败。
function listOnlyFields(summary, detailText = '') {
  const text = stripHtmlText(detailText || summary.description || '').replace(/\s+/g, ' ').trim();
  const company = String(summary.company || COMPANY_RE.exec(text)?.[1] || '').trim().slice(0, 100);
  const position = String(summary.position || '').trim().slice(0, 160);
  const deadlineMatch = DEADLINE_RE.exec(text);
  const summaryDeadline = /^\d{4}-\d{2}-\d{2}/.test(String(summary.deadline || ''))
    ? String(summary.deadline).slice(0, 10) : null;
  const location = summary.location
    || COLLECT_CITIES.map((city) => city.name).find((name) => name !== '远程/不限' && text.includes(name))
    || null;
  const major = summary.major || MAJOR_RE.exec(text)?.[1]?.trim() || null;
  const descriptor = `${position} ${major || ''} ${summary.property || ''}`;
  const positionType = summary.positionType || inferPositionType(descriptor) || '实习';
  const classification = classifyJob({
    company,
    position,
    majorRequirements: major,
    positionType,
    sourceIndustry: summary.industry || null,
    location,
    applyLink: summary.applyLink || null,
    sourceUrl: summary.sourceUrl || null,
  });
  const fields = {
    company,
    position,
    location: location ? String(location).slice(0, 100) : null,
    position_type: classification.position_type,
    is_intern: classification.is_intern,
    major_requirements: major ? String(major).slice(0, 500) : null,
    apply_link: summary.applyLink || null,
    deadline: summaryDeadline || (deadlineMatch
      ? `${deadlineMatch[1]}-${deadlineMatch[2].padStart(2, '0')}-${deadlineMatch[3].padStart(2, '0')}`
      : null),
    deadline_raw: summary.deadlineRaw || null,
    pay: summary.pay || null,
    published_at: summary.publishedAt || null,
    direction: classification.direction,
    industry: classification.industry,
    industry_source: classification.industry_source,
    company_nature: inferCompanyNature(summary.property, company),
    confidence: company ? LIST_ONLY_CONFIDENCE + 0.05 : LIST_ONLY_CONFIDENCE - 0.1,
  };
  fields.parse_failed_fields = failedParseFields(fields);
  return fields;
}

// 规则解析在公司/城市/分类上明显偏弱时，才值得花一次兜底额度。
function listFieldsNeedLlm(fields) {
  if (!fields.company || !fields.position) return true;
  if (!fields.location) return true;
  if (!fields.direction || fields.direction === '其他') return true;
  if (!fields.industry || fields.industry === '其他') return true;
  return false;
}

// 只补空缺字段，不用 LLM 结果覆盖规则已识别的内容。
function mergeLlmCompletion(base, extra) {
  const merged = { ...base };
  for (const key of ['company', 'position', 'location', 'major_requirements', 'deadline', 'direction', 'industry', 'company_nature']) {
    const current = merged[key];
    const weak = !current || current === '其他';
    if (weak && extra[key]) merged[key] = extra[key];
  }
  merged.pay = base.pay || extra.pay || null;
  merged.published_at = base.published_at || extra.published_at || null;
  merged.confidence = Math.max(Number(base.confidence) || 0, 0.52);
  merged.parse_failed_fields = failedParseFields(merged);
  return merged;
}

export async function collectList({ db, sourceId, page = 1, criteria = {}, dryRun = false, fetcher = fetch }) {
  const source = await getSource(db, sourceId, fetcher);
  const conditions = normalizeCriteria(criteria);
  const pageNumber = Math.max(1, Math.min(50, Number(page) || 1));
  let list;
  try {
    list = await fetchSourceList(db, source, conditions, pageNumber, fetcher);
  } catch (error) {
    if (error?.code === 'anti_crawl_blocked' && source.kind === 'yjs') {
      // 城市频道被拦截时退回专业频道首页
      list = await fetchSourceList(db, source, { ...conditions, cityInfo: null, city: '' }, pageNumber, fetcher);
    } else {
      throw error;
    }
  }

  const known = await buildKnownChecker(db);
  const now = isoSeconds(new Date());
  const detailFetchable = Boolean(source.detailFetchable && source.detailUrl);
  const queued = [];
  let matched = 0;
  let skipped = 0;
  let unmatched = 0;
  let dateFiltered = 0;
  let expired = 0;

  for (const entry of list.items) {
    const item = { ...entry.summary, city: entry.summary.city || null };
    if (!matchesCriteria(conditions, item)) {
      unmatched += 1;
      continue;
    }
    matched += 1;
    if (isStalePublished(item, conditions.publishedWithinDays)) {
      dateFiltered += 1;
      continue;
    }
    if (conditions.openOnly && isClosedDeadline(item)) {
      expired += 1;
      continue;
    }
    if (!entry.detailUrl || await known.isKnown(entry.detailUrl)) {
      skipped += 1;
      continue;
    }
    if (queued.length >= MAX_QUEUE_PER_RUN) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      queued.push({
        rawId: null,
        company: item.company || '未识别公司',
        position: item.position,
        location: item.location || null,
        detailUrl: entry.detailUrl,
        mode: detailFetchable ? 'detail' : 'list_only',
      });
      continue;
    }
    const rawId = uuid();
    const rawText = JSON.stringify({
      kind: 'collect_item',
      mode: detailFetchable ? 'detail' : 'list_only',
      adapter: source.kind,
      jobId: entry.jobId ?? null,
      requestUrl: list.requestUrl,
      criteria: {
        directions: conditions.directions,
        industries: conditions.industries,
        majors: conditions.majors,
        majorText: conditions.majorText,
        city: conditions.city,
        positionKeywords: conditions.positionKeywords,
        publishedWithinDays: conditions.publishedWithinDays,
        openOnly: conditions.openOnly,
      },
      summary: item,
    });
    await db.from('raw_contents').insert({
      id: rawId,
      file_path: `site://${source.kind}/${entry.key}`,
      source_name: canonicalSourceName(source.name),
      source_url: entry.detailUrl,
      crawled_at: now,
      parse_status: 'pending',
      error_message: null,
      raw_text: rawText,
    }).select('id');
    known.remember(entry.detailUrl);
    if (source.custom) {
      try {
        await db.from('sources').update({ last_collected_at: now, last_run_url: list.requestUrl })
          .eq('id', source.id).select('id');
      } catch {
        // 自定义源统计写入失败不影响采集结果
      }
    }
    queued.push({
      rawId,
      company: item.company || '未识别公司',
      position: item.position,
      location: item.location || null,
      detailUrl: entry.detailUrl,
      mode: detailFetchable ? 'detail' : 'list_only',
    });
  }

  return {
    source: { id: source.id, name: source.name, kind: source.kind, custom: Boolean(source.custom) },
    criteria: conditions,
    page: pageNumber,
    requestUrl: list.requestUrl,
    totalInSource: list.total,
    found: list.items.length,
    matched,
    unmatched,
    dateFiltered,
    expired,
    queued: queued.length,
    skipped,
    dryRun: Boolean(dryRun),
    parseMode: detailFetchable ? 'detail_llm' : 'list_only',
    items: queued,
  };
}



// 一次「立即采集」可跑多个来源；单个来源失败不影响其余来源。
// target > 0 时自动翻页补足目标条数（前端默认要求一次不少于 20 条）。
export async function collectRun({ db, sourceIds = [], criteria = {}, page = 1, target = 0, dryRun = false, fetcher = fetch }) {
  const ids = (Array.isArray(sourceIds) ? sourceIds : [sourceIds])
    .map((id) => String(id || '').trim()).filter(Boolean);
  const sources = await loadSources(db);
  const targets = (ids.length ? sources.filter((source) => ids.includes(source.id) && source.enabled) : sources.filter((source) => source.enabled));
  if (!targets.length) throw collectError(404, 'source_not_found', '没有可用的采集数据源。');
  const goal = Math.max(0, Math.min(MAX_QUEUE_PER_RUN * MAX_PAGES_PER_RUN, Number(target) || 0));
  const results = [];
  for (const targetSource of targets) {
    try {
      const runs = [];
      let pageNumber = Math.max(1, Number(page) || 1);
      const lastPage = goal ? Math.min(50, pageNumber + MAX_PAGES_PER_RUN - 1) : pageNumber;
      while (pageNumber <= lastPage) {
        const run = await collectList({ db, sourceId: targetSource.id, criteria, page: pageNumber, dryRun, fetcher });
        runs.push(run);
        const queuedTotal = runs.reduce((sum, item) => sum + item.queued, 0);
        if (queuedTotal >= goal || !run.found) break;
        pageNumber += 1;
      }
      results.push(mergeRunPages(runs));
    } catch (error) {
      results.push({
        source: { id: targetSource.id, name: targetSource.name, kind: targetSource.kind, custom: Boolean(targetSource.custom) },
        error: error.expose ? error.message : '采集失败，请查看采集日志。',
        code: error.code || 'collect_failed',
        found: 0, matched: 0, unmatched: 0, dateFiltered: 0, expired: 0, queued: 0, skipped: 0, items: [],
      });
    }
  }
  return {
    target: goal,
    dryRun: Boolean(dryRun),
    results,
    totals: results.reduce((sum, item) => ({
      found: sum.found + (item.found || 0),
      matched: sum.matched + (item.matched || 0),
      unmatched: sum.unmatched + (item.unmatched || 0),
      dateFiltered: sum.dateFiltered + (item.dateFiltered || 0),
      expired: sum.expired + (item.expired || 0),
      queued: sum.queued + (item.queued || 0),
      skipped: sum.skipped + (item.skipped || 0),
    }), { found: 0, matched: 0, unmatched: 0, dateFiltered: 0, expired: 0, queued: 0, skipped: 0 }),
  };
}

function mergeRunPages(runs) {
  const first = runs[0];
  const items = runs.flatMap((run) => run.items || []);
  return {
    ...first,
    pagesRun: runs.length,
    pageUrls: runs.map((run) => run.requestUrl),
    found: runs.reduce((sum, run) => sum + run.found, 0),
    matched: runs.reduce((sum, run) => sum + run.matched, 0),
    unmatched: runs.reduce((sum, run) => sum + run.unmatched, 0),
    dateFiltered: runs.reduce((sum, run) => sum + run.dateFiltered, 0),
    expired: runs.reduce((sum, run) => sum + run.expired, 0),
    skipped: runs.reduce((sum, run) => sum + run.skipped, 0),
    queued: items.length,
    items,
    requestUrl: runs[runs.length - 1].requestUrl,
  };
}

// ---------- 开站增量刷新 ----------

const REFRESH_STATE_ID = 'site_open';
const REFRESH_TTL_MS = 10 * 60 * 1000;
const REFRESH_LOCK_MS = 60 * 1000;
const REFRESH_BUDGET_MS = 20000;
const REFRESH_CRITERIA = { publishedWithinDays: 7, openOnly: true };

function timestampMs(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : 0;
}

async function readRefreshState(db, id = REFRESH_STATE_ID) {
  const rows = dbRows(await db.from('crawl_state').select('*').eq('id', id).limit(1));
  return rows[0] || null;
}

async function acquireRefreshLock(db, state, startedAt, lockUntil, id = REFRESH_STATE_ID) {
  const patch = {
    last_started_at: startedAt,
    last_status: 'running',
    lock_until: lockUntil,
    updated_at: startedAt,
  };
  if (!state) {
    try {
      dbRows(await db.from('crawl_state').insert({
        id,
        summary: '{}',
        ...patch,
      }).select('id'));
      return true;
    } catch {
      return false;
    }
  }
  const guardColumn = state.updated_at ? 'updated_at' : 'last_started_at';
  const guardValue = state.updated_at || state.last_started_at || '';
  const query = db.from('crawl_state').update(patch).eq('id', id);
  const updated = dbRows(await (guardValue ? query.eq(guardColumn, guardValue) : query).select('id'));
  return updated.length > 0;
}

async function finishRefreshState(db, { status, summary, finished }, id = REFRESH_STATE_ID) {
  const now = isoSeconds(new Date());
  const patch = {
    last_status: status,
    lock_until: now,
    summary: JSON.stringify(summary),
    updated_at: now,
  };
  if (finished) patch.last_finished_at = now;
  try {
    await db.from('crawl_state').update(patch).eq('id', id).select('id');
  } catch {
    // 状态写入失败不影响已完成的采集
  }
}

export async function refreshOnOpen({ db, llm, fetcher = fetch }) {
  const now = Date.now();
  let state;
  try {
    state = await readRefreshState(db);
  } catch {
    return { refreshed: false, reason: 'state_unavailable' };
  }

  const lockUntil = timestampMs(state?.lock_until);
  if (lockUntil > now) {
    return { refreshed: false, skipped: true, reason: 'locked', retryAfterMs: lockUntil - now };
  }
  const finishedAt = timestampMs(state?.last_finished_at);
  if (finishedAt && now - finishedAt < REFRESH_TTL_MS) {
    return {
      refreshed: false,
      skipped: true,
      reason: 'fresh',
      retryAfterMs: finishedAt + REFRESH_TTL_MS - now,
    };
  }

  const startedAt = isoSeconds(new Date());
  const lockIso = isoSeconds(new Date(now + REFRESH_LOCK_MS));
  if (!(await acquireRefreshLock(db, state, startedAt, lockIso))) {
    return { refreshed: false, skipped: true, reason: 'locked', retryAfterMs: REFRESH_LOCK_MS };
  }

  const started = Date.now();
  const deadline = started + REFRESH_BUDGET_MS;
  const result = {
    newJobs: 0,
    deduped: 0,
    discarded: 0,
    failed: 0,
    deferred: 0,
    sources: [],
  };
  let hadSourceError = false;

  try {
    for (const source of BUILTIN_SOURCES.filter((item) => item.enabled)) {
      if (Date.now() >= deadline) {
        result.sources.push({ sourceId: source.id, name: source.name, skipped: 'budget' });
        continue;
      }
      try {
        const run = await collectList({
          db,
          sourceId: source.id,
          page: 1,
          criteria: REFRESH_CRITERIA,
          fetcher,
        });
        const sourceResult = {
          sourceId: source.id,
          name: source.name,
          found: run.found,
          queued: run.items.length,
          newJobs: 0,
          deduped: 0,
          discarded: 0,
          failed: 0,
          deferred: 0,
        };
        for (const item of run.items) {
          if (Date.now() >= deadline) {
            sourceResult.deferred += 1;
            result.deferred += 1;
            continue;
          }
          try {
            const parsed = await parseCollectedItem({ db, llm, rawId: item.rawId, fetcher });
            if (parsed?.deduped) {
              sourceResult.deduped += 1;
              result.deduped += 1;
            } else if (parsed?.internship?.status === 'discarded') {
              sourceResult.discarded += 1;
              result.discarded += 1;
            } else if (parsed?.internship) {
              sourceResult.newJobs += 1;
              result.newJobs += 1;
            }
          } catch {
            sourceResult.failed += 1;
            result.failed += 1;
          }
        }
        result.sources.push(sourceResult);
      } catch (error) {
        hadSourceError = true;
        result.sources.push({
          sourceId: source.id,
          name: source.name,
          error: error.expose ? error.message : '采集失败，请稍后再试。',
        });
      }
    }

    const status = hadSourceError
      ? (result.newJobs || result.deduped || result.failed ? 'partial' : 'failed')
      : 'success';
    await finishRefreshState(db, {
      status,
      summary: result,
      finished: status !== 'failed',
    });
    return { refreshed: true, status, ...result, durationMs: Date.now() - started };
  } catch (error) {
    await finishRefreshState(db, {
      status: 'failed',
      summary: { ...result, error: '刷新失败' },
      finished: false,
    });
    throw error;
  }
}

// ---------- 每日自动采集 ----------

const DAILY_STATE_ID = 'daily_collect';
const DAILY_LOCK_MS = 45 * 1000;
const DAILY_BUDGET_MS = 22 * 1000;
const DAILY_TARGET_PER_SOURCE = 40;
const DAILY_ROUNDS_MAX = 8;
const DAILY_CRITERIA = { publishedWithinDays: 7, openOnly: true };

function shanghaiDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(date);
}

async function rawParseCounts(db) {
  const rows = dbRows(await db.from('raw_contents')
    .select('id,parse_status')
    .order('crawled_at', { ascending: true })
    .limit(1000));
  let pending = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.parse_status === 'pending') pending += 1;
    if (row.parse_status === 'failed') failed += 1;
  }
  return { pending, failed };
}

// 对外公开的每日采集入口：每个自然日（Asia/Shanghai）只抓取一次，
// 同一天的后续调用只继续解析队列，避免被反复触发产生额外 LLM 消耗。
export async function runDailyCollect({ db, llm, target = DAILY_TARGET_PER_SOURCE, fetcher = fetch }) {
  const now = Date.now();
  let state = null;
  try {
    state = await readRefreshState(db, DAILY_STATE_ID);
  } catch {
    return { skipped: 'state_unavailable' };
  }
  const lockUntil = timestampMs(state?.lock_until);
  if (lockUntil > now) {
    return { skipped: 'locked', retryAfterMs: lockUntil - now };
  }
  let previous = {};
  try {
    previous = JSON.parse(state?.summary || '{}') || {};
  } catch {
    previous = {};
  }
  const today = shanghaiDate();
  const fetchedToday = previous.date === today;
  const goal = Math.max(1, Math.min(MAX_QUEUE_PER_RUN, Number(target) || DAILY_TARGET_PER_SOURCE));

  const startedAt = isoSeconds(new Date());
  const lockIso = isoSeconds(new Date(now + DAILY_LOCK_MS));
  if (!(await acquireRefreshLock(db, state, startedAt, lockIso, DAILY_STATE_ID))) {
    return { skipped: 'locked', retryAfterMs: DAILY_LOCK_MS };
  }

  const started = Date.now();
  const deadline = started + DAILY_BUDGET_MS;
  const result = {
    date: fetchedToday ? previous.date : today,
    fetchedAt: fetchedToday ? previous.fetchedAt || null : startedAt,
    fetched: !fetchedToday,
    target: goal,
    queued: 0,
    parsed: 0,
    stored: 0,
    discarded: 0,
    failed: 0,
    sourceErrors: 0,
  };
  let status = 'success';
  try {
    if (!fetchedToday) {
      const run = await collectRun({ db, criteria: DAILY_CRITERIA, page: 1, target: goal, dryRun: false, fetcher });
      result.queued = run.totals.queued;
      result.sourceErrors = run.results.filter((item) => item.error).length;
      if (result.sourceErrors) status = 'partial';
    }
    let rounds = 0;
    while (Date.now() < deadline && rounds < DAILY_ROUNDS_MAX) {
      const batch = await reparseQueue({ db, llm, limit: 20, fetcher });
      rounds += 1;
      result.parsed += batch.attempted;
      result.stored += batch.stored;
      result.discarded += batch.discarded;
      result.failed += batch.failed.length;
      if (!batch.attempted || batch.remaining === 0) break;
    }
    const counts = await rawParseCounts(db);
    result.pending = counts.pending;
    result.remainingFailed = counts.failed;
    result.done = counts.pending === 0;
    if (result.failed || counts.failed) status = status === 'success' ? 'partial' : status;
    await finishRefreshState(db, { status, summary: result, finished: result.done }, DAILY_STATE_ID);
    return { status, ...result, durationMs: Date.now() - started };
  } catch (error) {
    await finishRefreshState(db, {
      status: 'failed',
      // 抓取失败时不登记当日已完成，允许当天重试
      summary: { ...result, date: previous.date || null, fetchedAt: previous.fetchedAt || null, error: '每日采集失败' },
      finished: false,
    }, DAILY_STATE_ID);
    throw error;
  }
}

// ---------- 解析 ----------

function normalizeField(value, max = 200) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, max) : null;
}

function normalizeDate(value) {
  const text = normalizeField(value, 40);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

// 记录缺失的关键字段，便于统计解析覆盖率与来源质量。
const PARSE_TRACKED_FIELDS = [
  'company', 'position', 'location', 'pay', 'deadline', 'published_at', 'major_requirements', 'apply_link',
];

function failedParseFields(fields) {
  return PARSE_TRACKED_FIELDS.filter((key) => {
    const value = fields?.[key];
    return value === null || value === undefined || String(value).trim() === '';
  });
}

function normalizeParsed(parsed, summary) {
  const company = normalizeField(parsed.company) || normalizeField(summary.company) || '';
  const position = normalizeField(parsed.position) || normalizeField(summary.position) || '';
  const positionType = ['实习', '校招', '社招'].includes(parsed.position_type)
    ? parsed.position_type
    : '实习';
  const majorRequirements = normalizeField(parsed.major_requirements, 500) || normalizeField(summary.major, 500);
  const location = normalizeField(parsed.location) || normalizeField(summary.location);
  const applyLink = normalizeField(parsed.apply_link, 1000);
  const classification = classifyJob({
    company,
    position,
    majorRequirements,
    positionType,
    sourceIndustry: summary.industry || null,
    location,
    applyLink,
    sourceUrl: summary.sourceUrl || null,
  });
  const nature = COMPANY_NATURE_VALUES.includes(parsed.company_nature)
    ? parsed.company_nature
    : inferCompanyNature(summary.property, company);
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  const fields = {
    company,
    position,
    location,
    position_type: classification.position_type,
    is_intern: classification.is_intern,
    major_requirements: majorRequirements,
    apply_link: applyLink,
    deadline: normalizeDate(parsed.deadline),
    deadline_raw: normalizeField(parsed.deadline_raw, 200),
    pay: normalizeField(summary.pay, 60),
    published_at: summary.publishedAt || null,
    direction: classification.direction,
    industry: classification.industry,
    industry_source: classification.industry_source,
    company_nature: nature,
    confidence: company && position ? confidence : 0,
  };
  fields.parse_failed_fields = failedParseFields(fields);
  return fields;
}

function buildCollectPrompt(text, summary, criteria) {
  const listInfo = [
    summary.company ? `公司：${summary.company}` : '',
    summary.position ? `岗位：${summary.position}` : '',
    summary.location ? `地点：${summary.location}` : '',
    summary.degree ? `学历：${summary.degree}` : '',
    summary.major ? `专业：${summary.major}` : '',
    summary.property ? `单位性质：${summary.property}` : '',
    summary.pay ? `薪资：${summary.pay}` : '',
  ].filter(Boolean).join('；');
  return COLLECT_PROMPT
    .replace('{{directions}}', DIRECTIONS.join('|'))
    .replace('{{industries}}', INDUSTRIES.join('|'))
    .replace('{{criteria}}', criteria ? `8. 用户的筛选条件为「${criteria}」，direction 与 major_requirements 请优先参考，但不得虚构原文中不存在的信息。\n` : '')
    .replace('{{content}}', `${listInfo}${listInfo ? '\n\n' : ''}${text.slice(0, PARSE_TEXT_MAX_CHARS)}`);
}

function criteriaSummaryText(criteria) {
  if (!criteria) return '';
  const parts = [];
  if (criteria.directions?.length) parts.push(`职能方向：${criteria.directions.join('、')}`);
  if (criteria.industries?.length) parts.push(`行业：${criteria.industries.join('、')}`);
  if (criteria.majors?.length) parts.push(`对口专业：${criteria.majors.join('、')}`);
  if (criteria.majorText) parts.push(`专业补充：${criteria.majorText}`);
  if (criteria.city) parts.push(`意向城市：${criteria.city}`);
  if (criteria.positionKeywords?.length) parts.push(`意向岗位：${criteria.positionKeywords.join('、')}`);
  return parts.join('；');
}

function resolveSourceByName(sources, name, raw) {
  const wanted = canonicalSourceName(name);
  const byName = sources.find((item) => item.name === name
    || (wanted && canonicalSourceName(item.name) === wanted));
  if (byName) return byName;
  const adapter = parseJson(raw.raw_text, {}).adapter;
  return sources.find((item) => item.kind === adapter) || sources.find((item) => item.kind === 'ncss') || BUILTIN_SOURCES[0];
}

async function saveInternshipFromFields(db, { raw, fields, model, detailText }) {
  const rawPosition = String(fields.position || '');
  const classification = classifyJob({
    company: fields.company,
    position: rawPosition,
    majorRequirements: fields.major_requirements,
    positionType: fields.position_type,
    sourceIndustry: fields.industry_source === 'source' ? fields.industry : null,
    location: fields.location,
    applyLink: fields.apply_link,
    sourceUrl: raw.source_url,
  });
  fields.position = cleanPositionTitle(rawPosition);
  fields.location = refineCityFromTitle(fields.location, rawPosition, fields.company);
  fields.position_type = classification.position_type;
  fields.is_intern = classification.is_intern === 1;
  fields.direction = classification.direction;
  fields.industry = classification.industry;
  fields.industry_source = classification.industry_source;
  // 采集结果直接入库：只丢弃缺岗位名或明显社招的非实习岗位，其余无需人工确认。
  const record = parseJson(raw.raw_text, {});
  const openOnly = record?.criteria?.openOnly !== false;
  const closed = openOnly && isClosedDeadline(fields);
  const keep = Boolean(fields.company && fields.position)
    && !(fields.position_type === '社招' && !fields.is_intern)
    && !closed;
  const status = keep ? 'confirmed' : 'discarded';
  const now = isoSeconds(new Date());
  const dedupeKey = jobDedupeKey(fields.company, fields.position);
  // 只取来源页相同或公司名一致的行做去重，避免每次入库全表扫描；跨公司写法差异由列表接口兜底合并。
  const byUrlRows = dbRows(await db.from('internships').select('*').eq('source_url', raw.source_url).limit(1));
  const byCompanyRows = dedupeKey
    ? dbRows(await db.from('internships').select('*').eq('company', fields.company).limit(DB_MAX_ROWS))
    : [];
  const candidateMap = new Map();
  for (const row of [...byUrlRows, ...byCompanyRows]) {
    if (!candidateMap.has(row.id)) candidateMap.set(row.id, row);
  }
  // 同一来源页必然是同一条；跨来源/跨城市按「公司+岗位+类型」归并，城市在 location 中合并。
  const duplicate = [...candidateMap.values()].map(mapInternship).find((item) => (
    item.source_url === raw.source_url
    || (dedupeKey
      && jobDedupeKey(item.company, item.position) === dedupeKey
      && (item.position_type || '校招') === fields.position_type)
  ));
  const sourceName = canonicalSourceName(raw.source_name);
  if (duplicate) {
    const additional = Array.isArray(duplicate.additional_sources)
      ? duplicate.additional_sources.map(canonicalSourceName).filter(Boolean)
      : [];
    if (raw.source_url !== duplicate.source_url && sourceName
      && sourceName !== canonicalSourceName(duplicate.source_name)
      && !additional.includes(sourceName)) {
      additional.push(sourceName);
    }
    const patch = { additional_sources: JSON.stringify(additional), updated_at: now };
    const mergedLocation = mergeLocations(duplicate.location, fields.location);
    if (mergedLocation && mergedLocation !== duplicate.location) patch.location = mergedLocation;
    if (fields.confidence > duplicate.confidence) {
      Object.assign(patch, {
        location: mergedLocation || fields.location,
        position_type: fields.position_type,
        is_intern: fields.is_intern ? 1 : 0,
        major_requirements: fields.major_requirements,
        apply_link: fields.apply_link || raw.source_url,
        deadline: fields.deadline,
        deadline_raw: fields.deadline_raw,
        pay: fields.pay || duplicate.pay || null,
        published_at: duplicate.published_at || fields.published_at || null,
        direction: fields.direction,
        industry: fields.industry,
        industry_source: fields.industry_source,
        company_nature: fields.company_nature,
        confidence: String(fields.confidence),
        source_model: model,
        parse_failed_fields: JSON.stringify(fields.parse_failed_fields || []),
      });
    }
    if (fields.pay && !duplicate.pay) patch.pay = fields.pay;
    if (fields.published_at && !duplicate.published_at) patch.published_at = fields.published_at;
    await db.from('internships').update(patch).eq('id', duplicate.id).select('id');
    await markRawParsed(db, raw, detailText);
    return { deduped: true, internship: { id: duplicate.id, company: duplicate.company, position: duplicate.position } };
  }

  const internshipId = uuid();
  await db.from('internships').insert({
    id: internshipId,
    company: fields.company,
    position_title: fields.position,
    location: fields.location,
    position_type: fields.position_type,
    is_intern: fields.is_intern ? 1 : 0,
    major_requirements: fields.major_requirements,
    apply_link: fields.apply_link || raw.source_url,
    deadline: fields.deadline,
    deadline_raw: fields.deadline_raw,
    pay: fields.pay || null,
    published_at: fields.published_at || null,
    source_url: raw.source_url,
    source_name: canonicalSourceName(raw.source_name),
    confidence: String(fields.confidence),
    source_model: model,
    source_prompt_version: 'collect_v1',
    status,
    created_at: now,
    updated_at: now,
    direction: fields.direction,
    industry: fields.industry,
    industry_source: fields.industry_source,
    company_nature: fields.company_nature,
    raw_content_id: raw.id,
    additional_sources: '[]',
    edited_fields: '[]',
    parse_failed_fields: JSON.stringify(fields.parse_failed_fields || []),
  }).select('id');
  await markRawParsed(db, raw, detailText);
  return {
    internship: {
      id: internshipId,
      company: fields.company,
      position: fields.position,
      direction: fields.direction,
      industry: fields.industry,
      status,
      confidence: fields.confidence,
    },
  };
}

async function markRawParsed(db, raw, detailText) {
  const merged = detailText
    ? `${raw.raw_text || ''}\n\n详情页文本：\n${detailText}`.slice(0, PARSE_TEXT_MAX_CHARS * 2)
    : raw.raw_text;
  await db.from('raw_contents').update({ parse_status: 'parsed', error_message: null, raw_text: merged })
    .eq('id', raw.id).select('id');
}

export async function parseCollectedItem({ db, llm, rawId, fetcher = fetch }) {
  const rows = dbRows(await db.from('raw_contents').select('*').eq('id', rawId).limit(1));
  const raw = rows[0];
  if (!raw) throw collectError(404, 'raw_not_found', '待解析内容不存在。');
  if (raw.parse_status === 'parsed') return { alreadyParsed: true };

  const record = parseJson(raw.raw_text, {});
  const summary = record.summary || {};
  const mode = record.mode || (record.kind === 'ncss_list_item' ? 'detail' : 'list_only');

  // 列表字段解析：先用规则，弱字段再用 LLM 兜底（每天限量）。
  if (mode !== 'detail') {
    let fields = listOnlyFields(summary, summary.description || '');
    if (!fields.position) {
      await db.from('raw_contents').update({
        parse_status: 'failed',
        error_message: '列表内容缺少岗位名称',
      }).eq('id', rawId).select('id');
      throw collectError(422, 'parse_incomplete', '列表内容缺少岗位名称，无法解析。');
    }
    let model = 'list_rules';
    let parseMode = 'list_only';
    let fallback = null;
    if (listFieldsNeedLlm(fields) && siteLlmStatus().ready && typeof llm === 'function') {
      if (await claimCollectLlmCall(db)) {
        try {
          const output = await llm({
            model: siteLlmModel(),
            temperature: 0,
            maxTokens: 1024,
            prompt: buildCollectPrompt('', summary, criteriaSummaryText(record.criteria)),
          });
          const parsed = output?.data && typeof output.data === 'object' ? output.data : output;
          const completion = normalizeParsed(parsed || {}, summary);
          if (completion.company && completion.position) {
            fields = mergeLlmCompletion(fields, completion);
            model = 'list_llm_fallback';
            parseMode = 'list_llm';
            fallback = 'llm_completed';
          } else {
            fallback = 'llm_incomplete';
          }
        } catch {
          fallback = 'llm_failed';
        }
      } else {
        fallback = 'budget_exhausted';
      }
    }
    const saved = await saveInternshipFromFields(db, { raw, fields, model, detailText: '' });
    return { ...saved, parseMode, fallback };
  }

  const sources = await loadSources(db);
  const source = resolveSourceByName(sources, raw.source_name, raw);
  let detailText = '';
  const model = siteLlmModel();

  const fallback = async (reason) => {
    const fields = listOnlyFields(summary, detailText);
    if (!fields.position) {
      await db.from('raw_contents').update({
        parse_status: 'failed',
        error_message: String(reason).slice(0, 500),
      }).eq('id', rawId).select('id');
      throw collectError(422, 'parse_incomplete', `未能识别岗位名称（${reason}）。`);
    }
    const saved = await saveInternshipFromFields(db, {
      raw,
      fields,
      model: 'list_fallback',
      detailText,
    });
    return { ...saved, parseMode: 'list_fallback', fallbackReason: reason };
  };

  try {
    const detail = await fetchText(db, source, raw.source_url, { minBytes: 512, fetcher });
    detailText = stripHtmlText(detail.text).slice(0, PARSE_TEXT_MAX_CHARS);
  } catch (error) {
    return fallback(`详情页抓取失败：${error.message || '未知错误'}`);
  }

  let parsed;
  try {
    const output = await llm({
      model,
      temperature: 0,
      maxTokens: 2048,
      prompt: buildCollectPrompt(detailText, summary, criteriaSummaryText(record.criteria)),
    });
    parsed = output?.data && typeof output.data === 'object' ? output.data : output;
  } catch (error) {
    return fallback(`LLM 解析失败：${String(error.message || '请稍后重试').slice(0, 160)}`);
  }

  const fields = normalizeParsed(parsed || {}, summary);
  if (!fields.company || !fields.position) {
    const fallbackFields = listOnlyFields(summary, detailText);
    if (fallbackFields.company && fallbackFields.position) {
      return fallback('LLM 未识别完整公司与岗位，已使用规则解析');
    }
    await db.from('raw_contents').update({
      parse_status: 'failed',
      error_message: '未能识别公司与岗位',
    }).eq('id', rawId).select('id');
    throw collectError(422, 'parse_incomplete', '未能识别公司与岗位，请保留原始内容后重试。');
  }
  const saved = await saveInternshipFromFields(db, { raw, fields, model, detailText });
  return { ...saved, parseMode: 'detail_llm' };
}

// 批量续跑历史待解析/失败记录；单次限量，避免超出函数执行时间。
export async function reparseQueue({ db, llm, limit = 10, fetcher = fetch }) {
  const batch = Math.max(1, Math.min(20, Number(limit) || 10));
  const rows = dbRows(await db.from('raw_contents')
    .select('id,parse_status,crawled_at')
    .order('crawled_at', { ascending: true })
    .limit(500));
  const targets = rows
    .filter((row) => row.parse_status === 'pending' || row.parse_status === 'failed')
    .slice(0, batch);
  let stored = 0;
  let discarded = 0;
  const failed = [];
  for (const row of targets) {
    try {
      const result = await parseCollectedItem({ db, llm, rawId: row.id, fetcher });
      if (result?.internship?.status === 'discarded') discarded += 1;
      else stored += 1;
    } catch (error) {
      failed.push({ rawId: row.id, message: String(error?.message || error).slice(0, 200) });
    }
  }
  const after = dbRows(await db.from('raw_contents')
    .select('id,parse_status')
    .limit(1000));
  const remaining = after.filter((row) => row.parse_status === 'pending' || row.parse_status === 'failed').length;
  return { attempted: targets.length, stored, discarded, failed, remaining };
}

// ---------- 自定义公开渠道 ----------

function validatePublicUrl(value) {
  const text = String(value || '').trim();
  let url;
  try {
    url = new URL(text);
  } catch {
    throw collectError(422, 'invalid_url', '请输入合法的公开渠道列表页 URL。');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw collectError(422, 'invalid_url', '仅支持 http/https 公开页面。');
  if (url.username || url.password) throw collectError(422, 'invalid_url', 'URL 不能包含账号信息。');
  return url;
}

// 试探性读取公开列表页，返回可采集的岗位链接预览（不落库）。
export async function discoverSource({ db, url, name, fetcher = fetch }) {
  const target = validatePublicUrl(url);
  const source = {
    id: 'preview',
    kind: 'generic',
    name: String(name || '').trim().slice(0, 60) || target.hostname,
    baseUrl: `${target.protocol}//${target.host}`,
    listUrl: target.toString(),
    detailUrl: null,
    detailFetchable: false,
  };
  const list = await fetchGenericList(db, source, normalizeCriteria({}), 1, fetcher);
  return {
    baseUrl: source.baseUrl,
    hostname: target.hostname,
    listUrl: source.listUrl,
    robotsStatus: robotsCache.get(source.baseUrl)?.status || '未检查',
    candidates: list.items.slice(0, 10).map((entry) => ({
      position: entry.summary.position,
      detailUrl: entry.detailUrl,
    })),
    candidateCount: list.items.length,
    hint: list.items.length
      ? '可采集：将按列表页链接解析岗位标题，只用列表字段，置信度偏低。'
      : '未发现岗位链接：该页面可能需要登录、由脚本渲染或不公开，建议更换来源。',
  };
}

export async function addSource({ db, url, name, notes, category }) {
  const target = validatePublicUrl(url);
  const baseUrl = `${target.protocol}//${target.host}`;
  const id = uuid();
  const now = isoSeconds(new Date());
  const row = {
    id,
    kind: 'generic',
    category: SOURCE_CATEGORY_IDS.includes(category) ? category : 'company',
    name: String(name || '').trim().slice(0, 60) || target.hostname,
    base_url: baseUrl,
    list_url: target.toString(),
    detail_url: null,
    crawl_interval_min: '240',
    notes: String(notes || '').trim().slice(0, 300) || '用户添加的公开渠道列表页。',
    enabled: '1',
    created_at: now,
    last_collected_at: null,
    last_run_url: null,
  };
  const result = await db.from('sources').insertIfAbsent(row, { onConflict: 'list_url' }).select('id');
  if (result?.error?.code === 'unique_violation') {
    throw collectError(409, 'source_exists', '该公开渠道已添加。');
  }
  dbRows(result);
  return { id, name: row.name, baseUrl, listUrl: row.list_url, category: row.category };
}

export async function removeSource({ db, sourceId }) {
  const rows = dbRows(await db.from('sources').select('id').eq('id', sourceId).limit(1));
  if (!rows.length) throw collectError(404, 'source_not_found', '自定义数据源不存在。');
  await db.from('sources').delete().eq('id', sourceId).select('id');
  return { id: sourceId };
}

export async function setSourceEnabled({ db, sourceId, enabled }) {
  const rows = dbRows(await db.from('sources').select('id').eq('id', sourceId).limit(1));
  if (!rows.length) throw collectError(404, 'source_not_found', '自定义数据源不存在。');
  await db.from('sources').update({ enabled: enabled ? '1' : '0' }).eq('id', sourceId).select('id');
  return { id: sourceId, enabled: Boolean(enabled) };
}

// ---------- 状态 ----------

export async function collectStatus({ db }) {
  const [rawRows, internshipRows, logRows, sources] = await Promise.all([
    db.from('raw_contents')
      .select('id,source_url,source_name,parse_status,error_message,raw_text,crawled_at')
      .order('crawled_at', { ascending: false })
      .limit(1000),
    loadInternships(db),
    db.from('crawl_logs').select('*').order('fetched_at', { ascending: false }).limit(500),
    loadSources(db),
  ]);
  const raws = dbRows(rawRows);
  const logs = dbRows(logRows);
  const rawCounts = { pending: 0, parsed: 0, failed: 0 };
  for (const raw of raws) {
    if (raw.parse_status in rawCounts) rawCounts[raw.parse_status] += 1;
  }
  const queue = raws
    .filter((raw) => raw.parse_status === 'pending' || raw.parse_status === 'failed')
    .slice(0, 100)
    .map((raw) => {
      const record = parseJson(raw.raw_text, {});
      const summary = record.summary || {};
      return {
        rawId: raw.id,
        company: summary.company || '未识别公司',
        position: summary.position || '未识别岗位',
        location: summary.location || null,
        mode: record.mode || (record.kind === 'ncss_list_item' ? 'detail' : 'list_only'),
        status: raw.parse_status,
        error: raw.error_message || null,
        sourceUrl: raw.source_url,
      };
    });
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthLogs = logs.filter((log) => String(log.fetched_at || '').startsWith(monthPrefix));
  const success = monthLogs.filter((log) => log.outcome === 'success' || log.outcome === 'robots_ok').length;
  const antiCrawl = monthLogs.filter((log) => log.outcome === 'anti_crawl').length;
  const robotsSkipped = monthLogs.filter((log) => log.outcome === 'robots_skip').length;
  const today = new Date().toISOString().slice(0, 10);
  const todayCalls = logs.filter((log) => String(log.fetched_at || '').startsWith(today)).length;
  const llm = siteLlmStatus();

  return {
    sources: sources.map((source) => ({
      id: source.id,
      kind: source.kind,
      category: source.category,
      name: source.name,
      listUrl: source.listUrl,
      detailFetchable: Boolean(source.detailFetchable),
      crawlIntervalMin: source.crawlIntervalMin,
      notes: source.notes,
      enabled: source.enabled,
      custom: Boolean(source.custom),
      robotsStatus: robotsCache.get(source.baseUrl)?.status || '未检查',
    })),
    llm: {
      ready: llm.ready,
      reason: llm.reason,
      message: llm.message,
      mode: siteLlmModel(),
    },
    sourceCategories: SOURCE_CATEGORIES.map((entry) => ({ ...entry })),
    cities: COLLECT_CITIES.map((city) => city.name),
    counts: {
      ...rawCounts,
      internshipsPending: internshipRows.filter((item) => item.status === 'pending_review').length,
      internshipsConfirmed: internshipRows.filter((item) => item.status === 'confirmed').length,
    },
    month: {
      totalRequests: monthLogs.length,
      successRate: monthLogs.length ? success / monthLogs.length : null,
      antiCrawlBlocked: antiCrawl,
      robotsSkipped,
      todayCalls,
    },
    queue,
    recentLogs: logs.slice(0, 20).map((log) => ({
      sourceName: log.source_name,
      url: log.url,
      status: log.http_status,
      outcome: log.outcome,
      message: log.message,
      fetchedAt: log.fetched_at,
    })),
  };
}
