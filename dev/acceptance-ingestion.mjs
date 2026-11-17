import { createMemoryDb } from './memory-db.mjs';
import { collectList, parseCollectedItem } from '../functions/collect.mjs';

globalThis.Deno = { env: { get: () => undefined } };
process.env.INTERNRADAR_LOCAL_DEV = '1';

const SOURCES = [
  { sourceId: 'ncss', criteria: {}, pages: 3 },
  { sourceId: 'yjs', criteria: { majors: ['计算机类'] }, pages: 1 },
];
const llm = async () => { throw new Error('LLM must not be called for list-only acceptance'); };

async function crawlAndIngest() {
  const db = createMemoryDb();
  const runs = [];
  const saved = [];
  for (const source of SOURCES) {
    for (let page = 1; page <= source.pages; page += 1) {
      let run;
      try {
        run = await collectList({ db, sourceId: source.sourceId, page, criteria: source.criteria, dryRun: false });
      } catch (error) {
        runs.push({ source: source.sourceId, page, error: error.message, code: error.code || null });
        continue;
      }
      runs.push({
        source: source.sourceId, page, found: run.found, matched: run.matched,
        queued: run.queued, skipped: run.skipped, mode: run.parseMode,
      });
      for (const item of run.items || []) {
        try {
          const parsed = await parseCollectedItem({ db, llm, rawId: item.rawId });
          saved.push({ source: source.sourceId, rawId: item.rawId, ...parsed });
        } catch (error) {
          saved.push({ source: source.sourceId, rawId: item.rawId, error: error.message });
        }
      }
    }
  }
  const rows = db.tables.get('internships') || [];
  const byUrl = new Map();
  for (const row of rows) {
    byUrl.set(row.source_url, {
      company: row.company,
      position: row.position_title,
      location: row.location,
      direction: row.direction,
      industry: row.industry,
      industrySource: row.industry_source,
      positionType: row.position_type,
      isIntern: Boolean(row.is_intern),
      status: row.status,
    });
  }
  return { db, runs, saved, rows, byUrl };
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] ?? '(空)';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function audit(rows) {
  const wrong = [];
  const known = {
    researchInstituteAsPublic: rows.filter((row) => row.industry === '公共部门'
      && /研究院|研究所/.test(String(row.company || ''))),
    enterpriseManagementAsConsulting: rows.filter((row) => row.industry === '咨询'
      && /企业管理/.test(String(row.company || ''))),
    transportFallbackSupplyChain: rows.filter((row) => row.direction === '供应链'
      && /航空|物流|交通/.test(String(row.company || ''))),
    majorWordMarketing: rows.filter((row) => row.direction === '市场'
      && /操作工|普工|技工|管培生|操作员/.test(String(row.position || ''))),
  };
  for (const row of rows) {
    if (row.industry === '机械/装备' && /编辑|期刊|记者|文案/.test(String(row.position || ''))) {
      wrong.push({ rule: 'editor-filed-as-machinery', ...row });
    }
    if (row.industry === '广告/公关' && /药业|制药|医药/.test(String(row.company || ''))) {
      wrong.push({ rule: 'pharma-filed-as-advertising', ...row });
    }
  }
  return { known, wrong };
}

const first = await crawlAndIngest();
const second = await crawlAndIngest();

const common = [...first.byUrl.keys()].filter((url) => second.byUrl.has(url));
const mismatches = common.filter((url) => {
  const a = first.byUrl.get(url);
  const b = second.byUrl.get(url);
  return a.direction !== b.direction || a.industry !== b.industry
    || a.industrySource !== b.industrySource || a.positionType !== b.positionType
    || a.isIntern !== b.isIntern || a.status !== b.status;
}).map((url) => ({ url, first: first.byUrl.get(url), second: second.byUrl.get(url) }));

const parseErrors = [...first.saved, ...second.saved].filter((item) => item.error);
const auditFirst = audit([...first.byUrl.values()]);
const auditSecond = audit([...second.byUrl.values()]);

console.log(JSON.stringify({
  first: {
    runs: first.runs,
    rawParsed: first.saved.length,
    rows: first.rows.length,
    typeCounts: countBy([...first.byUrl.values()], 'positionType'),
    directionCounts: countBy([...first.byUrl.values()], 'direction'),
    industryCounts: countBy([...first.byUrl.values()], 'industry'),
    blankDirection: [...first.byUrl.values()].filter((row) => row.direction === null).length,
    blankIndustry: [...first.byUrl.values()].filter((row) => row.industry === null).length,
  },
  second: {
    runs: second.runs,
    rawParsed: second.saved.length,
    rows: second.rows.length,
  },
  commonUrls: common.length,
  mismatches: mismatches.length,
  mismatchSamples: mismatches.slice(0, 8),
  parseErrorCount: parseErrors.length,
  parseErrorSamples: parseErrors.slice(0, 5),
  knownErrorRecurrence: {
    researchInstituteAsPublic: auditFirst.known.researchInstituteAsPublic.length
      + auditSecond.known.researchInstituteAsPublic.length,
    enterpriseManagementAsConsulting: auditFirst.known.enterpriseManagementAsConsulting.length
      + auditSecond.known.enterpriseManagementAsConsulting.length,
    transportFallbackSupplyChain: auditFirst.known.transportFallbackSupplyChain.length
      + auditSecond.known.transportFallbackSupplyChain.length,
    majorWordMarketing: auditFirst.known.majorWordMarketing.length
      + auditSecond.known.majorWordMarketing.length,
    editorFiledAsMachinery: auditFirst.wrong.length + auditSecond.wrong.length,
    samples: {
      researchInstituteAsPublic: [...auditFirst.known.researchInstituteAsPublic, ...auditSecond.known.researchInstituteAsPublic].slice(0, 4),
      editorFiledAsMachinery: [...auditFirst.wrong, ...auditSecond.wrong].slice(0, 4),
    },
  },
  samples: [...first.byUrl.entries()].slice(0, 20).map(([url, row]) => ({ url, ...row })),
}, null, 2));
