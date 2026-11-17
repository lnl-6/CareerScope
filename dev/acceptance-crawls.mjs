import fs from 'node:fs';
import path from 'node:path';
import { classifyJob } from '../functions/core.mjs';

const root = path.resolve(import.meta.dirname, '..');
const tokenFile = path.join(root, '.admin-token');
const token = process.env.INTERNRADAR_ADMIN_TOKEN
  || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : '');
if (!token) throw new Error('缺少管理员令牌：请设置 INTERNRADAR_ADMIN_TOKEN 或创建 web/.admin-token');
const base = 'https://careerscope-tb8isknpdbc.qoder.zone/functions/v1/app/api';

async function postAdmin(route, body) {
  const response = await fetch(`${base}${route}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': token,
      origin: 'https://careerscope-tb8isknpdbc.qoder.zone',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${route} ${response.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

function itemsOf(run) {
  const items = [];
  for (const result of run.results || []) {
    for (const item of result.items || []) {
      const classification = classifyJob({
        company: item.company || '',
        position: item.position || '',
        location: item.location || null,
      });
      items.push({
        source: result.source?.id,
        detailUrl: item.detailUrl,
        company: item.company,
        position: item.position,
        location: item.location,
        mode: item.mode,
        direction: classification.direction,
        industry: classification.industry,
        industrySource: classification.industry_source,
        positionType: classification.position_type,
        isIntern: classification.is_intern,
      });
    }
  }
  return items;
}

function summarize(run, items) {
  const counts = (key) => items.reduce((acc, item) => {
    const value = item[key] ?? '(空)';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  return {
    totals: run.totals,
    results: (run.results || []).map((result) => ({
      source: result.source?.id,
      found: result.found,
      matched: result.matched,
      unmatched: result.unmatched,
      dateFiltered: result.dateFiltered,
      expired: result.expired,
      queued: result.queued,
      skipped: result.skipped,
      pagesRun: result.pagesRun,
      mode: result.parseMode,
      error: result.error || null,
    })),
    items: items.length,
    directionCounts: counts('direction'),
    industryCounts: counts('industry'),
    typeCounts: counts('positionType'),
  };
}

const run1 = await postAdmin('/admin/collect/run', {
  sourceIds: ['ncss', 'yjs'], page: 1, target: 60, dryRun: true,
});
const items1 = itemsOf(run1);
const run2 = await postAdmin('/admin/collect/run', {
  sourceIds: ['ncss', 'yjs'], page: 1, target: 60, dryRun: true,
});
const items2 = itemsOf(run2);

const map1 = new Map(items1.map((item) => [item.detailUrl, item]));
const map2 = new Map(items2.map((item) => [item.detailUrl, item]));
const common = [...map1.keys()].filter((url) => map2.has(url));
const mismatches = common.filter((url) => {
  const a = map1.get(url);
  const b = map2.get(url);
  return a.direction !== b.direction || a.industry !== b.industry
    || a.industrySource !== b.industrySource || a.positionType !== b.positionType
    || a.isIntern !== b.isIntern;
}).map((url) => ({ a: map1.get(url), b: map2.get(url) }));

const repeated = items1.filter((item) => {
  const hit = map2.get(item.detailUrl);
  return hit && hit.direction === item.direction && hit.industry === item.industry;
});
const known = {
  researchInstituteAsPublic: items1.filter((item) => item.industry === '公共部门'
    && /研究院|研究所/.test(String(item.company || ''))),
  enterpriseManagementAsConsulting: items1.filter((item) => item.industry === '咨询'
    && /企业管理/.test(String(item.company || ''))),
  transportFallbackSupplyChain: items1.filter((item) => item.direction === '供应链'
    && /航空|物流|交通/.test(String(item.company || ''))),
  majorWordMarketing: items1.filter((item) => item.direction === '市场'
    && /操作工|普工|技工|管培生|操作员/.test(String(item.position || ''))),
};

console.log(JSON.stringify({
  run1: summarize(run1, items1),
  run2: summarize(run2, items2),
  commonItems: common.length,
  repeatedSameClassification: repeated.length,
  mismatches: mismatches.length,
  mismatchSamples: mismatches.slice(0, 5),
  knownErrorRecurrence: {
    researchInstituteAsPublic: known.researchInstituteAsPublic.length,
    enterpriseManagementAsConsulting: known.enterpriseManagementAsConsulting.length,
    transportFallbackSupplyChain: known.transportFallbackSupplyChain.length,
    majorWordMarketing: known.majorWordMarketing.length,
    samples: {
      researchInstituteAsPublic: known.researchInstituteAsPublic.slice(0, 3),
      enterpriseManagementAsConsulting: known.enterpriseManagementAsConsulting.slice(0, 3),
      transportFallbackSupplyChain: known.transportFallbackSupplyChain.slice(0, 3),
      majorWordMarketing: known.majorWordMarketing.slice(0, 3),
    },
  },
}, null, 2));
