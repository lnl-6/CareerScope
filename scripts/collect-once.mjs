#!/usr/bin/env node
// 一次性首爬脚本：复用站点采集接口，默认只预览，--commit 才写入岗位。
const DEFAULT_BASE = 'https://internradar-tb8isknpdbc.qoder.zone';

function usage() {
  console.log(`用法：
  node scripts/collect-once.mjs [选项]

选项：
  --base <url>       站点地址，默认 ${DEFAULT_BASE}
  --target <n>       每个来源目标条数，默认 50
  --page <n>         起始页，默认 1
  --sources <list>   来源，默认 ncss,yjs
  --commit           真正写入岗位；不加时只做 dry-run
  --help             显示帮助`);
}

function parseArgs(argv) {
  const options = {
    base: process.env.INTERNRADAR_BASE_URL || DEFAULT_BASE,
    target: 50,
    page: 1,
    sources: ['ncss', 'yjs'],
    commit: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--commit') options.commit = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--base') options.base = argv[++index] || '';
    else if (arg.startsWith('--base=')) options.base = arg.slice('--base='.length);
    else if (arg === '--target') options.target = Number(argv[++index]);
    else if (arg.startsWith('--target=')) options.target = Number(arg.slice('--target='.length));
    else if (arg === '--page') options.page = Number(argv[++index]);
    else if (arg.startsWith('--page=')) options.page = Number(arg.slice('--page='.length));
    else if (arg === '--sources') options.sources = String(argv[++index] || '').split(',');
    else if (arg.startsWith('--sources=')) options.sources = arg.slice('--sources='.length).split(',');
    else throw new Error(`未知参数：${arg}`);
  }
  options.sources = options.sources.map((item) => item.trim()).filter(Boolean);
  if (!/^https?:\/\/\S+$/i.test(options.base)) throw new Error('--base 需要是合法的 http(s) 地址。');
  if (!Number.isFinite(options.target) || options.target <= 0) throw new Error('--target 需要是正整数。');
  if (!Number.isFinite(options.page) || options.page <= 0) throw new Error('--page 需要是正整数。');
  if (!options.sources.length) throw new Error('--sources 至少需要一个来源。');
  return options;
}

function apiUrl(base, path) {
  const normalized = base.replace(/\/+$/, '');
  const prefix = normalized.endsWith('/functions/v1/app')
    ? normalized
    : `${normalized}/functions/v1/app`;
  return `${prefix}${path}`;
}

async function post(base, path, body, timeoutMs) {
  const origin = new URL(base).origin;
  const response = await fetch(apiUrl(base, path), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      referer: `${origin}/`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`HTTP ${response.status}：响应不是合法 JSON`);
    }
  }
  if (!response.ok) {
    throw new Error(data?.error?.message || `HTTP ${response.status}`);
  }
  return data;
}

function printRun(results, totals, dryRun) {
  for (const row of results || []) {
    const name = row.source?.name || '数据源';
    if (row.error) {
      console.log(`- ${name}：失败（${row.error}）`);
      continue;
    }
    console.log(`- ${name}：抓取 ${row.found || 0}，匹配 ${row.matched || 0}，` +
      `可入队 ${row.queued || 0}，发布时间过旧 ${row.dateFiltered || 0}，` +
      `已截止 ${row.expired || 0}，跳过 ${row.skipped || 0}`);
  }
  console.log(`合计：抓取 ${totals?.found || 0}，可入队 ${totals?.queued || 0}` +
    (dryRun ? '（dry-run，未写入岗位）' : ''));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  console.log('InternRadar 首爬');
  console.log(`站点：${options.base}`);
  console.log(`模式：${options.commit ? 'commit（会写入岗位）' : 'dry-run（只预览，不写入岗位）'}`);
  console.log(`来源：${options.sources.join(', ')}；每源目标：${options.target}；起始页：${options.page}`);
  console.log('');

  const run = await post(options.base, '/api/admin/collect/run', {
    sourceIds: options.sources,
    page: options.page,
    target: options.target,
    dryRun: !options.commit,
    criteria: { publishedWithinDays: 7, openOnly: true },
  }, 240000);

  printRun(run.results, run.totals, !options.commit);

  if (!options.commit) {
    console.log('\n预览完成。确认无误后加 --commit 执行首爬。');
    return;
  }

  const items = (run.results || []).flatMap((row) => row.items || []).filter((item) => item.rawId);
  if (!items.length) {
    console.log('\n没有需要解析的新岗位。');
    return;
  }

  console.log(`\n开始解析 ${items.length} 条岗位（列表规则解析，不调用 LLM）...`);
  let stored = 0;
  let discarded = 0;
  let failed = 0;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    try {
      const result = await post(options.base, '/api/admin/collect/parse', { rawId: item.rawId }, 60000);
      if (result?.internship?.status === 'discarded') discarded += 1;
      else stored += 1;
    } catch (error) {
      failed += 1;
      console.error(`  [${index + 1}/${items.length}] 失败：${item.company} · ${item.position}（${error.message}）`);
    }
    if ((index + 1) % 10 === 0 || index === items.length - 1) {
      console.log(`  进度 ${index + 1}/${items.length}：入库 ${stored}，未入库 ${discarded}，未解析 ${failed}`);
    }
  }

  console.log(`\n完成：入库 ${stored}，未入库 ${discarded}，未解析 ${failed}。`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`首爬失败：${error?.message || error}`);
  process.exitCode = 1;
});
