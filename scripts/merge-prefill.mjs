#!/usr/bin/env node
// 合并分批采集结果：跨批次去重、按发布时间排序并输出统一统计。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSink, isFresh, summarize } from './prefill-local.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function parseArgs(argv) {
  const files = [];
  let out = 'data/prefill-merged.json';
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--out') out = argv[++index] || out;
    else if (argv[index].startsWith('--out=')) out = argv[index].slice('--out='.length);
    else files.push(argv[index]);
  }
  if (!files.length) throw new Error('请至少提供一个批次 JSON 文件。');
  return { files, out };
}

const { files, out } = parseArgs(process.argv.slice(2));
const sink = createSink();
let loaded = 0;
for (const file of files) {
  const path = resolve(ROOT, file);
  const payload = JSON.parse(await readFile(path, 'utf8'));
  const jobs = Array.isArray(payload) ? payload : payload.jobs;
  if (!Array.isArray(jobs)) throw new Error(`${file} 缺少 jobs 数组。`);
  loaded += jobs.length;
  for (const job of jobs) sink.add(job);
  console.log(`${file}：${jobs.length} 条`);
}

const jobs = sink.values()
  .filter((job) => isFresh(job.published_at, 120))
  .sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));
const stats = summarize(jobs);
const outputPath = resolve(ROOT, out);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  sources: files,
  loaded,
  stats,
  jobs,
}, null, 2), 'utf8');

console.log('');
console.log(`合并完成：读取 ${loaded} 条，去重后 ${stats.total} 条，企业 ${stats.companies} 家`);
console.log(`  来源：${Object.entries(stats.bySource).map(([name, count]) => `${name} ${count}`).join('；')}`);
console.log(`  字段覆盖率：薪资 ${stats.coverageRates.pay}%；发布时间 ${stats.coverageRates.publishedAt}%；专业 ${stats.coverageRates.major}%`);
console.log(`  方向可识别 ${stats.coverageRates.direction}%；行业可识别 ${stats.coverageRates.industry}%`);
console.log(`  岗位类型：${Object.entries(stats.positionTypes).map(([name, count]) => `${name} ${count}`).join('；')}`);
console.log(`  输出：${outputPath}`);
