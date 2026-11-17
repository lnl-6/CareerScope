// Node 冒烟测试：验证 routes/index 注入面与核心业务链路（不含真实云端 DB/LLM）。
import { createMemoryDb } from './memory-db.mjs';
import { application } from '../functions/routes.mjs';

process.env.INTERNRADAR_PUBLIC_LLM_DAILY_LIMIT = '2';
process.env.INTERNRADAR_LOCAL_DEV = '1';
globalThis.Deno = { env: { get: (name) => process.env[name] } };

const db = createMemoryDb();
const siteCalls = [];
const answer = {
  data: {
    company: '字节跳动', position: '运维实习生', location: '北京',
    position_type: '实习', is_intern: true, major_requirements: '计算机相关专业',
    apply_link: null, deadline: '2027-06-30', deadline_raw: null,
    direction: '技术', industry: '互联网/软件', company_nature: '民企', confidence: 0.9,
  },
  usage: { prompt_tokens: 10, completion_tokens: 5 },
};
const llm = async ({ model }) => {
  siteCalls.push(model);
  return answer;
};

function fakeResponse(body, status, url) {
  const bytes = Buffer.isBuffer(body) ? new Uint8Array(body) : new Uint8Array(Buffer.from(body, 'utf-8'));
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: { get: (name) => (name === 'content-length' ? String(bytes.byteLength) : null) },
    text: async () => (Buffer.isBuffer(body) ? new TextDecoder('utf-8').decode(bytes) : body),
    arrayBuffer: async () => bytes.buffer,
  };
}

const listItems = [
  {
    jobId: 'job-1001', jobName: '测试开发实习生', recName: '测试科技有限公司', areaCodeName: '北京',
    major: '计算机相关专业', degreeName: '本科', recProperty: '民营企业', headCount: 2,
    lowMonthPay: 4, highMonthPay: 6, publishDate: '2026-11-10T00:00:00',
  },
  {
    jobId: 'job-1002', jobName: '前端开发实习生', recName: '测试科技有限公司', areaCodeName: '上海',
    major: '软件工程', degreeName: '本科', recProperty: '民营企业', headCount: 1,
    lowMonthPay: 4, highMonthPay: 6, publishDate: '2026-11-11T00:00:00',
  },
  {
    jobId: 'job-1003', jobName: '测试开发实习生', recName: '测试科技有限公司', areaCodeName: '上海',
    major: '计算机相关专业', degreeName: '本科', recProperty: '民营企业', headCount: 1,
    lowMonthPay: 4, highMonthPay: 6, publishDate: '2026-11-12T00:00:00',
  },
];
const detailHtml = `<html><body><h1>测试开发实习生</h1><p>${'岗位详情与岗位要求。'.repeat(80)}</p></body></html>`;
// 应届生列表页真实结构：每行 4 列（标题链接 / 工作地点 / 信息来源 / 发布日期），标题为「[城市范围]公司 岗位」。
const yjsListHtml = `<html><body><!--${'应届生求职网专业频道列表。'.repeat(30)}--><table class="jobul">
<tr class="jobli"><td width="582"><a href="http://www.yingjiesheng.com/job-008-149-322.html" target="_blank">[北京]字节跳动科技有限公司 算法实习生</a></td><td width="152"><span>北京</span></td><td width="155"><span class="sub">北京大学</span></td><td width="92"><span class="sub">2026-11-09</span></td></tr>
<tr class="jobli"><td width="582"><a href="http://www.yingjiesheng.com/job-008-149-323.html" target="_blank">[上海]上海某某银行股份有限公司 金融科技实习生</a></td><td width="152"><span>上海,杭州,...</span></td><td width="155"><span class="sub">复旦大学</span></td><td width="92"><span class="sub">2026-11-10</span></td></tr>
</table><p class="clear"><span class="act">共259条</span></p></body></html>`;
// GBK 编码列表页：字节序列不是合法 UTF-8，必须回退到 GBK 解码。
const gbkMarker = Buffer.from([0xB1, 0xB1, 0xBE, 0xA9]);
const gbkMarkerText = new TextDecoder('gbk').decode(gbkMarker);
const gbkListBytes = Buffer.concat([
  Buffer.from(`<html><body><!--${'gbk encoded public job listing page for smoke test. '.repeat(20)}--><ul><li><a href="/jobs/gbk-intern.html">campus intern `, 'latin1'),
  Buffer.from(gbkMarker),
  Buffer.from('</a></li></ul></body></html>', 'latin1'),
]);
// 自定义公开渠道：高校就业网式列表页。
const genericListHtml = `<html><body><!--${'高校就业信息网公开招聘栏目。'.repeat(30)}--><ul>
<li><a href="/jobs/2026/11/intern-001.html">某研究院 数据分析实习岗位招聘</a></li>
<li><a href="/jobs/2026/11/intern-002.html">某制造集团 机械工程师校园招聘</a></li>
<li><a href="/about.html">关于我们</a></li>
</ul></body></html>`;
// 国聘公开列表接口：校招/实习，列表自带正文、截止时间、地点与单位性质。
const guopinNow = new Date(Date.now() - 86400000);
const guopinStart = guopinNow.toISOString().slice(0, 19).replace('T', ' ');
const guopinEnd = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
const guopinItems = [
  {
    job_id: 'gp-1001', job_name: '后端开发实习生', company_name: '国聘测试科技有限公司',
    nature_cn: '实习', recruitment_type_cn: '校园招聘', category_cn: '后端开发',
    min_wage: 200, max_wage: 300, wage_unit_cn: '元/天', is_negotiable: false,
    education_cn: '本科', experience_cn: '在校生', start_time: guopinStart, end_time: guopinEnd,
    district_list: [{ area_cn: '北京-海淀区' }, { area_cn: '上海-浦东新区' }],
    contents: '岗位职责：负责后端服务开发。任职要求：计算机相关专业，熟悉 Java 与数据库。',
    company_info: { nature_cn: '国企', industry_cn: '软件和信息技术服务业', scale_cn: '1000-2000人' },
  },
  {
    job_id: 'gp-1002', job_name: '数据分析师（2027届）', company_name: '国聘测试集团有限公司',
    nature_cn: '校招', recruitment_type_cn: '校园招聘', category_cn: '数据分析',
    min_wage: 12000, max_wage: 18000, wage_unit_cn: '元/月', is_negotiable: false,
    education_cn: '硕士', experience_cn: '应届生', start_time: guopinStart, end_time: guopinEnd,
    district_list: [{ area_cn: '广州-天河区' }],
    contents: '岗位职责：负责经营数据分析。任职要求：统计学、数学相关专业。',
    company_info: { nature_cn: '国企', industry_cn: '商务服务业', scale_cn: '500-1000人' },
  },
];
const fetched = [];
const fetcher = async (url) => {
  const href = String(url);
  fetched.push(href);
  if (href.endsWith('/robots.txt')) return fakeResponse('User-agent: *\nAllow: /\n', 200, href);
  if (href.includes('/jobslist/ajax/')) {
    return fakeResponse(JSON.stringify({ data: { list: listItems, pagenation: { total: 2 } } }), 200, href);
  }
  if (href.includes('gp-api.iguopin.com/api/jobs/v1/list')) {
    return fakeResponse(JSON.stringify({ code: 200, data: { total: 2, list: guopinItems } }), 200, href);
  }
  if (href.includes('/detail.html')) return fakeResponse(detailHtml, 200, href);
  if (href.includes('yingjiesheng.com/major/')) return fakeResponse(yjsListHtml, 200, href);
  if (href.includes('yingjiesheng.com/job-')) {
    return fakeResponse('<html><body>acw_sc__v2 aliyun_waf_aa renderData</body></html>', 200, href);
  }
  if (href === 'https://career.example.edu.cn/jobs') return fakeResponse(genericListHtml, 200, href);
  if (href === 'https://career.example.edu.cn/gbk') return fakeResponse(gbkListBytes, 200, href);
  throw new Error(`unexpected fetch: ${href}`);
};

const handle = application({ db, llm, fetcher });

let failures = 0;
async function call(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const request = new Request(`http://local/functions/v1/app${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await handle({ request, user: null, requestId: 'smoke' });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

function check(name, condition, detail) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.log(`FAIL ${name}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 500));
  }
}

async function runAll(experimentId, body, maxCalls = 20) {
  let last = null;
  for (let index = 0; index < maxCalls; index += 1) {
    last = await call(`/api/experiments/${experimentId}/run-batch`, { method: 'POST', body });
    if (last.status !== 200 || last.data.done) return last;
  }
  return last;
}

const health = await call('/api/health');
check('health', health.status === 200 && health.data.ok === true, health);

const board0 = await call('/api/board');
check('public board empty', board0.status === 200 && board0.data.rows.length === 0, board0);

const raw = { id: 'r'.repeat(32), file_path: 'x.raw', source_name: '牛客', source_url: 'https://example.com/1', crawled_at: '2026-11-01T10:00:00', parse_status: 'success', error_message: null, raw_text: '<p>字节跳动 运维实习生 北京 实习 6 月 30 日截止</p>' };
const pendingRow = {
  id: 'a'.repeat(32), company: '字节跳动', position_title: '运维实习生', location: null, position_type: null,
  is_intern: 0, major_requirements: null, apply_link: null, deadline: null, deadline_raw: '本月底',
  source_url: 'https://example.com/1', source_name: '牛客', confidence: 0.55, source_model: 'qwen-max-v2',
  source_prompt_version: 'prod_fewshot_v1', status: 'pending_review', created_at: '2026-11-02T10:00:00Z',
  updated_at: '2026-11-02T10:00:00Z', direction: null, company_nature: null, raw_content_id: raw.id,
  additional_sources: '[]', edited_fields: '[]',
};
const confirmedRow = {
  ...pendingRow, id: 'b'.repeat(32), company: '美团', position_title: '数据开发实习生', location: '北京',
  position_type: '实习', is_intern: 1, status: 'confirmed', direction: '数据与算法',
  apply_link: 'https://www.yingjiesheng.com/job-008-149-322.html',
  pay: '300-500/天', published_at: '2026-11-13T00:00:00Z',
};
const imported = await call('/api/admin/import', {
  method: 'POST',
  body: { rawContents: [raw], internships: [pendingRow, confirmedRow], applications: [] },
});
check('import seed', imported.status === 200 && imported.data.internships === 2, imported);

const board1 = await call('/api/board');
check('public board confirmed only', board1.data.rows.length === 1 && board1.data.rows[0].company === '美团', board1.data.rows);

const jobsDefault = await call('/api/jobs');
check('/api/jobs defaults to internships', jobsDefault.status === 200
  && jobsDefault.data.jobs.length === 1 && jobsDefault.data.jobs[0].isIntern === true, jobsDefault.data);
const jobsSearch = await call('/api/jobs?q=美团');
check('/api/jobs searches company and position', jobsSearch.status === 200
  && jobsSearch.data.jobs.length === 1 && jobsSearch.data.jobs[0].company === '美团', jobsSearch.data);
check('/api/jobs parses salary and cities', jobsSearch.data.jobs[0].salary?.min === 300
  && jobsSearch.data.jobs[0].salary?.unit === '元/天'
  && jobsSearch.data.jobs[0].cities?.includes('北京'), jobsSearch.data.jobs[0]);

const queue = await call('/api/admin/queue');
check('queue counts', queue.data.counts.pending === 1 && queue.data.counts.confirmed === 1, queue.data.counts);
check('queue raw text', queue.data.pending[0].rawText.includes('字节跳动'), queue.data.pending[0]);

const confirmed = await call(`/api/admin/internships/${pendingRow.id}/confirm`, {
  method: 'POST', body: { edits: { location: '北京', is_intern: true, position: '运维工程师（实习）', industry: '互联网/软件' } },
});
check('confirm edits', confirmed.status === 200 && confirmed.data.item.status === 'confirmed', confirmed);
check('edited fields recorded', confirmed.data.item.editedFields.includes('location')
  && confirmed.data.item.editedFields.includes('industry'), confirmed.data.item.editedFields);
check('industry persisted', confirmed.data.item.industry === '互联网/软件', confirmed.data.item.industry);

const applied = await call(`/api/admin/internships/${pendingRow.id}/apply`, {
  method: 'POST', body: { notes: '内推码 ABC' },
});
check('mark applied', applied.status === 200 && applied.data.application.status === 'applied', applied);

const transitioned = await call(`/api/admin/applications/${applied.data.application.id}/transition`, {
  method: 'POST', body: { status: 'offer' },
});
check('transition from applied to offer', transitioned.status === 200 && transitioned.data.status === 'offer', transitioned);

const illegal = await call(`/api/admin/applications/${applied.data.application.id}/transition`, {
  method: 'POST', body: { status: 'to_apply' },
});
check('illegal transition rejected', illegal.status === 400, illegal);

const board = await call('/api/board');
const appliedRow = board.data.rows.find((row) => row.company === '字节跳动');
check('board includes application data', appliedRow && appliedRow.notes === '内推码 ABC'
  && Boolean(appliedRow.appliedAt) && Boolean(appliedRow.applicationId), appliedRow);
check('board exposes application progress history', Array.isArray(appliedRow?.statusHistory)
  && appliedRow.statusHistory.length === 2
  && appliedRow.statusHistory[0].status === 'applied'
  && appliedRow.statusHistory[1].status === 'offer'
  && appliedRow.statusHistory[1].at, appliedRow?.statusHistory);

const backfill = await call('/api/admin/backfill-directions', { method: 'POST' });
check('backfill directions is idempotent after import', backfill.status === 200 && backfill.data.updated === 0, backfill);

const explore = await call('/api/explore?direction=数据与算法');
check('public explore filters confirmed jobs', explore.status === 200
  && explore.data.totalJobs === 1 && explore.data.jobs[0].company === '美团', explore.data);
check('explore exposes pay and publish time', explore.data.jobs[0].pay === '300-500/天'
  && explore.data.jobs[0].publishedAt === '2026-11-13T00:00:00Z', explore.data.jobs[0]);
check('public explore recommends companies', explore.data.recommendations.companies.length === 1
  && explore.data.recommendations.companies[0].company === '美团'
  && explore.data.recommendations.companies[0].score > 0, explore.data.recommendations);
check('explore hides application data', !('notes' in explore.data.jobs[0])
  && !('appliedAt' in explore.data.jobs[0]) && !('applicationId' in explore.data.jobs[0]), explore.data.jobs[0]);

const exploreIndustry = await call('/api/explore?industry=互联网%2F软件');
check('public explore filters by industry', exploreIndustry.status === 200
  && exploreIndustry.data.totalJobs === 1 && exploreIndustry.data.jobs[0].company === '字节跳动', exploreIndustry.data);
check('explore facets cross-count by industry', exploreIndustry.data.facets.directionTotal === 1
  && exploreIndustry.data.facets.industries['互联网/软件'] === 1
  && exploreIndustry.data.facets.industryTotal > 1, exploreIndustry.data.facets);

const fromConfirmed = await call('/api/admin/sample-sets/from-confirmed', {
  method: 'POST', body: { internshipIds: [pendingRow.id, confirmedRow.id], name: '测试样本' },
});
check('sample set from confirmed', fromConfirmed.status === 201 && fromConfirmed.data.sampleSet.count === 2, fromConfirmed);

const jsonSamples = {
  samples: Array.from({ length: 10 }, (_, index) => ({
    raw_text: `字节跳动 运维实习生 北京 2026-06-30 第${index + 1}条`,
    gold_labels: {
      company: '字节跳动', position: '运维实习生', location: '北京', position_type: '实习', is_intern: true,
      major_requirements: '计算机相关专业', apply_link: null, deadline: '2027-06-30', deadline_raw: null,
    },
  })),
};
const upload = await call('/api/sample-sets', {
  method: 'POST',
  body: { filename: 'samples.json', contentBase64: Buffer.from(JSON.stringify(jsonSamples)).toString('base64'), name: '公开冒烟样本' },
});
check('public upload sample set', upload.status === 201 && upload.data.sampleSet.count === 10, upload);

const meta = await call('/api/meta');
check('public meta payload', meta.status === 200 && meta.data.models.length === 2
  && meta.data.promptVersions.length >= 1 && meta.data.publicLimits.siteDailyCallLimit === 2, meta.data);
check('meta exposes site quota limits only', meta.data.publicLimits.siteMaxSamples === 20
  && meta.data.publicLimits.siteMaxModels === 2 && meta.data.publicLimits.providerOptions === undefined
  && meta.data.publicLimits.byoAllowedHosts === undefined, meta.data.publicLimits);

const siteExperiment = await call('/api/experiments', {
  method: 'POST',
  body: { sampleSetId: upload.data.sampleSet.id, modelNames: ['qwen-max-v2'], kind: 'model_comparison' },
});
check('create experiment', siteExperiment.status === 201
  && siteExperiment.data.experiment.provider === undefined, siteExperiment);

const pausedBatch = await call(`/api/experiments/${siteExperiment.data.experiment.id}/run-batch`, {
  method: 'POST', body: { budget: 2 },
});
check('site experiment partial batch', pausedBatch.status === 200 && pausedBatch.data.done === false, pausedBatch);

const paused = await call(`/api/experiments/${siteExperiment.data.experiment.id}/run-batch`, {
  method: 'POST', body: { budget: 1 },
});
check('site quota pauses experiment', paused.status === 200 && paused.data.done === true
  && paused.data.paused === true && String(paused.data.note).includes('额度'), paused);

const metaQuota = await call('/api/meta');
check('meta reports site quota usage', metaQuota.data.publicLimits.siteCallsToday === 2, metaQuota.data.publicLimits);

process.env.INTERNRADAR_PUBLIC_LLM_DAILY_LIMIT = '1000';
const siteRun = await runAll(siteExperiment.data.experiment.id, { budget: 8 });
check('site experiment completes', siteRun.status === 200 && siteRun.data.done === true
  && siteRun.data.status === 'completed', siteRun);
check('site llm calls counted', siteCalls.length === 10, siteCalls.length);

const siteDetail = await call(`/api/experiments/${siteExperiment.data.experiment.id}`);
check('public experiment detail', siteDetail.status === 200 && siteDetail.data.results.length === 1
  && siteDetail.data.results[0].runStatus === 'completed' && siteDetail.data.results[0].overallAccuracy > 0.99, siteDetail);
check('experiment detail does not expose quota counters', siteDetail.data.experiment.config._site_calls === undefined
  && siteDetail.data.experiment.config._site_calls_day === undefined, siteDetail.data.experiment.config);

const report = await call(`/api/experiments/${siteExperiment.data.experiment.id}/report`);
check('report markdown', report.status === 200 && report.data.markdown.includes('字段准确率排行'), report.data);

const storedRows = JSON.stringify([
  ...(db.tables.get('experiments') || []),
  ...(db.tables.get('experiment_results') || []),
]);
check('experiment config stores no provider', storedRows.includes('"provider"') === false, storedRows.slice(0, 300));

const sampleSet21 = {
  samples: Array.from({ length: 21 }, (_, index) => ({
    raw_text: `字节跳动 运维实习生 北京 2026-06-30 大批量第${index + 1}条`,
    gold_labels: {
      company: '字节跳动', position: '运维实习生', location: '北京', position_type: '实习', is_intern: true,
      major_requirements: '计算机相关专业', apply_link: null, deadline: '2027-06-30', deadline_raw: null,
    },
  })),
};
const upload21 = await call('/api/sample-sets', {
  method: 'POST',
  body: { filename: 'samples21.json', contentBase64: Buffer.from(JSON.stringify(sampleSet21)).toString('base64'), name: '21条样本' },
});
check('public upload 21 samples', upload21.status === 201 && upload21.data.sampleSet.count === 21, upload21);

const tooManySamples = await call('/api/experiments', {
  method: 'POST',
  body: { sampleSetId: upload21.data.sampleSet.id, modelNames: ['qwen-max-v2'], kind: 'model_comparison' },
});
check('experiment sample cap', tooManySamples.status === 400
  && String(tooManySamples.data.error.message).includes('20 条'), tooManySamples);

const badModel = await call('/api/experiments', {
  method: 'POST',
  body: { sampleSetId: upload.data.sampleSet.id, modelNames: ['my-model-1'], kind: 'model_comparison' },
});
check('experiment model allowlist', badModel.status === 400
  && String(badModel.data.error.message).includes('内置模型'), badModel);

const tooManyModels = await call('/api/experiments', {
  method: 'POST',
  body: {
    sampleSetId: upload.data.sampleSet.id,
    modelNames: ['qwen-max-v2', 'doubao-lite-32k', 'glm-4-plus'],
    kind: 'model_comparison',
  },
});
check('experiment model cap', tooManyModels.status === 400
  && String(tooManyModels.data.error.message).includes('2 个模型'), tooManyModels);

const abandonTarget = await call('/api/experiments', {
  method: 'POST',
  body: { sampleSetId: upload.data.sampleSet.id, modelNames: ['qwen-max-v2'], kind: 'model_comparison' },
});
check('create experiment with site quota', abandonTarget.status === 201, abandonTarget);

const abandon = await call(`/api/experiments/${abandonTarget.data.experiment.id}/abandon`, { method: 'POST', body: {} });
check('abandon experiment', abandon.status === 200 && abandon.data.status === 'failed', abandon);

const versions = meta.data.promptVersions;
const rollback = await call('/api/admin/prompt/rollback', { method: 'POST', body: { versionId: versions[0].versionId } });
check('prompt rollback', rollback.status === 200 && rollback.data.isActive === true, rollback);

const publicCollect = await call('/api/admin/collect/status');
check('public can read collect status', publicCollect.status === 200, publicCollect);

const collectStatus0 = await call('/api/admin/collect/status');
check('collect status lists built-in sources', collectStatus0.status === 200
  && collectStatus0.data.sources.length === 3
  && collectStatus0.data.sources[0].id === 'ncss' && collectStatus0.data.sources[1].id === 'yjs'
  && collectStatus0.data.sources[2].id === 'guopin', collectStatus0.data.sources);
check('built-in sources expose category', collectStatus0.data.sources.every((source) => source.category === 'official')
  && Array.isArray(collectStatus0.data.sourceCategories)
  && collectStatus0.data.sourceCategories.map((entry) => entry.id).includes('company'), collectStatus0.data.sourceCategories);
check('built-in source names are canonical', collectStatus0.data.sources.find((source) => source.id === 'yjs')?.name === '应届生求职网',
  collectStatus0.data.sources);
check('collect status exposes llm readiness', collectStatus0.data.llm && collectStatus0.data.llm.ready === false
  && collectStatus0.data.llm.reason === 'missing_api_base', collectStatus0.data.llm);
check('collect status exposes cities', Array.isArray(collectStatus0.data.cities)
  && collectStatus0.data.cities.includes('北京'), collectStatus0.data.cities?.length);
check('meta exposes grouped taxonomy', Array.isArray(meta.data.directionGroups)
  && meta.data.directionGroups.length >= 3
  && meta.data.directionGroups.every((entry) => Array.isArray(entry.items) && entry.items.length)
  && meta.data.majorGroups?.length >= 10 && meta.data.majorGroups[0].majors.length > 0, {
  directionGroups: meta.data.directionGroups?.length, majorGroups: meta.data.majorGroups?.length,
});

const criteria = { majors: ['计算机类'], directions: ['技术'], city: '北京', positionKeywords: ['测试'] };
const collected = await call('/api/admin/collect/list', {
  method: 'POST', body: { sourceId: 'ncss', page: 1, criteria },
});
check('collect filters by criteria', collected.status === 200 && collected.data.found === 3
  && collected.data.matched === 1 && collected.data.unmatched === 2
  && collected.data.queued === 1 && collected.data.skipped === 0, collected.data);
check('collect uses area code param', collected.data.requestUrl.includes('areaCode=110100')
  && collected.data.requestUrl.includes('jobName=%E6%B5%8B%E8%AF%95'), collected.data.requestUrl);
check('collect list fetched robots and list api', fetched.some((url) => url.endsWith('/robots.txt'))
  && fetched.some((url) => url.includes('/jobslist/ajax/')), fetched);

const duplicateList = await call('/api/admin/collect/list', {
  method: 'POST', body: { sourceId: 'ncss', page: 1, criteria },
});
check('collect list skips duplicates', duplicateList.status === 200
  && duplicateList.data.queued === 0 && duplicateList.data.skipped === 1, duplicateList.data);

// 方向词不做服务端标题精确匹配：岗位池小，收窄后稳定 0 条；只有用户手填关键词才透传。
const directionOnly = await call('/api/admin/collect/list', {
  method: "POST", body: { sourceId: 'ncss', page: 1, criteria: { directions: ['技术'], city: '北京' } },
});
check('direction words are not sent as source keyword', /jobName=&/.test(directionOnly.data.requestUrl), directionOnly.data.requestUrl);
check('source keyword comes from user keywords only', collected.data.requestUrl.includes('jobName=%E6%B5%8B%E8%AF%95')
  && !collected.data.requestUrl.includes('jobName=%E5%89%8D%E7%AB%AF'), collected.data.requestUrl);

const statusQueued = await call('/api/admin/collect/status');
check('collect status shows pending raws', statusQueued.data.counts.pending === 1
  && statusQueued.data.queue.length === 1 && statusQueued.data.queue[0].mode === 'list_only', statusQueued.data.counts);

const parsedItem = await call('/api/admin/collect/parse', {
  method: 'POST', body: { rawId: collected.data.items[0].rawId },
});
check('collect parse auto-confirms internship', parsedItem.status === 200
  && parsedItem.data.internship?.status === 'confirmed'
  && parsedItem.data.parseMode === 'list_only'
  && Number(parsedItem.data.internship.confidence) >= 0.3, parsedItem.data);
check('ncss parse skips detail page', !fetched.some((url) => url.includes('/detail.html')), fetched);
const llmCallsBefore = siteCalls.length;

// 同一公司+岗位换城市采集：写入时归并到同一条，城市合并展示。
const shanghaiList = await call('/api/admin/collect/list', {
  method: 'POST', body: { sourceId: 'ncss', page: 1, criteria: { city: '上海', positionKeywords: ['测试'] } },
});
check('collect queues same job from another city', shanghaiList.status === 200
  && shanghaiList.data.queued === 1, shanghaiList.data);
const shanghaiParsed = await call('/api/admin/collect/parse', {
  method: 'POST', body: { rawId: shanghaiList.data.items[0].rawId },
});
check('collect dedupes by company+position', shanghaiParsed.data.deduped === true
  && shanghaiParsed.data.internship?.id === parsedItem.data.internship.id, shanghaiParsed.data);
const mergedJob = await call('/api/jobs?q=%E6%B5%8B%E8%AF%95%E5%BC%80%E5%8F%91%E5%AE%9E%E4%B9%A0%E7%94%9F');
check('deduped job merges cities', mergedJob.data.jobs.length === 1
  && mergedJob.data.jobs[0].cities.includes('北京')
  && mergedJob.data.jobs[0].cities.includes('上海'), mergedJob.data.jobs);

const yjsRun = await call('/api/admin/collect/run', {
  method: 'POST', body: { sourceIds: ['yjs'], page: 1, target: 2, criteria: { majors: ['计算机类'] } },
});
check('yjs collect uses major channel', yjsRun.status === 200
  && String(yjsRun.data.results[0]?.requestUrl || '').includes('/major/jisuanji/'), yjsRun.data.results[0]);
check('yjs collect queues list-only items', yjsRun.data.results[0]?.parseMode === 'list_only'
  && yjsRun.data.results[0]?.queued >= 1
  && yjsRun.data.results[0]?.queued <= 2, yjsRun.data.results[0]);
check('collect respects target and page cap', yjsRun.data.target === 2
  && yjsRun.data.results[0]?.pagesRun >= 1
  && yjsRun.data.results[0]?.pagesRun <= 6, yjsRun.data.results[0]);
check('collect result exposes canonical source name', yjsRun.data.results[0]?.source?.name === '应届生求职网',
  yjsRun.data.results[0]?.source);
check('yjs collect reports source total and major channel', String(yjsRun.data.results[0]?.requestUrl || '').includes('/major/jisuanji/')
  && yjsRun.data.results[0]?.totalInSource > 0, yjsRun.data.results[0]);

const yjsPaged = await call('/api/admin/collect/run', {
  method: 'POST', body: { sourceIds: ['yjs'], page: 1, target: 20, criteria: { majors: ['计算机类'] } },
});
check('collect auto-pages until target or cap', yjsPaged.data.target === 20
  && yjsPaged.data.results[0]?.pagesRun === 6
  && yjsPaged.data.results[0]?.queued === 0, yjsPaged.data.results[0]);

const yjsStale = await call('/api/admin/collect/run', {
  method: 'POST', body: { sourceIds: ['yjs'], page: 1, criteria: { majors: ['计算机类'], publishedWithinDays: 3 } },
});
check('collect filters by publish window', yjsStale.data.results[0]?.dateFiltered === 2
  && yjsStale.data.results[0]?.queued === 0, yjsStale.data.results[0]);

// 城市频道 + 翻页：无匹配行时只证明 URL 结构，不改动队列。
const yjsCityPage = await call('/api/admin/collect/run', {
  method: "POST", body: { sourceIds: ['yjs'], page: 3, criteria: { majors: ['计算机类'], city: '成都' } },
});
check('yjs city channel and paginated list url', String(yjsCityPage.data.results[0]?.requestUrl || '').includes('/major/jisuanji/chengdu/list_3.html')
  && yjsCityPage.data.results[0]?.queued === 0, yjsCityPage.data.results[0]);
const yjsParsed = await call('/api/admin/collect/parse', {
  method: 'POST', body: { rawId: yjsRun.data.results[0]?.items?.[0]?.rawId },
});
check('yjs parse uses list fields without llm call', yjsParsed.status === 200
  && yjsParsed.data.parseMode === 'list_only' && siteCalls.length === llmCallsBefore, yjsParsed.data);
check('yjs parse low confidence auto-confirmed', yjsParsed.data.internship?.status === 'confirmed'
  && Number(yjsParsed.data.internship.confidence) >= 0.3
  && Boolean(yjsParsed.data.internship.company)
  && Boolean(yjsParsed.data.internship.position), yjsParsed.data.internship);
check('collected source name stored canonically', db.tables.get('internships')
  .find((row) => row.id === yjsParsed.data.internship.id)?.source_name === '应届生求职网',
yjsParsed.data.internship);
check('yjs detail blocked, not bypassed', !fetched.some((url) => url.includes('/job-008')), fetched.length);

// 国聘：列表字段已含正文、截止时间、多城市、薪资和单位性质，走 list_only 入库。
const guopinRun = await call('/api/admin/collect/run', {
  method: 'POST', body: { sourceIds: ['guopin'], page: 1, criteria: { publishedWithinDays: 7 } },
});
check('guopin collect queues campus and internship jobs', guopinRun.status === 200
  && guopinRun.data.results[0]?.found === 2 && guopinRun.data.results[0]?.queued === 2,
guopinRun.data.results[0]);
check('guopin collect uses post list api', String(guopinRun.data.results[0]?.requestUrl || '')
  .includes('gp-api.iguopin.com/api/jobs/v1/list'), guopinRun.data.results[0]);
const guopinParsed = await call('/api/admin/collect/parse', {
  method: 'POST', body: { rawId: guopinRun.data.results[0]?.items?.[0]?.rawId },
});
check('guopin parse keeps source deadline and pay', guopinParsed.status === 200
  && guopinParsed.data.internship?.status === 'confirmed'
  && db.tables.get('internships').find((row) => row.id === guopinParsed.data.internship.id)?.deadline === guopinEnd.slice(0, 10)
  && db.tables.get('internships').find((row) => row.id === guopinParsed.data.internship.id)?.pay === '200-300元/天',
guopinParsed.data);
check('guopin parse merges multi-city and source nature', db.tables.get('internships')
  .find((row) => row.id === guopinParsed.data.internship.id)?.location === '北京、上海'
  && db.tables.get('internships').find((row) => row.id === guopinParsed.data.internship.id)?.company_nature === '国企',
guopinParsed.data.internship);
check('guopin source name stored canonically', db.tables.get('internships')
  .find((row) => row.id === guopinParsed.data.internship.id)?.source_name === '国聘',
guopinParsed.data.internship);

// Phase 3d：列表字段缺失时用 LLM 补全，严格受每日预算限制。
const metaBeforeFallback = await call('/api/meta');
const usageBeforeFallback = metaBeforeFallback.data.publicLimits.siteCallsToday;
process.env.INTERNRADAR_LLM_API_BASE = 'http://127.0.0.1:9/fake';
process.env.INTERNRADAR_LLM_API_KEY = 'fake-key';
process.env.INTERNRADAR_COLLECT_LLM_DAILY_LIMIT = '1';
async function insertFallbackRaw(id, position) {
  await db.from('raw_contents').insert({
    id,
    file_path: `site://generic/fallback-${id}`,
    source_name: '示例高校就业网',
    source_url: `https://career.example.edu.cn/jobs/fallback-${id}.html`,
    crawled_at: '2026-11-15T10:00:00Z',
    parse_status: 'pending',
    error_message: null,
    raw_text: JSON.stringify({
      kind: 'collect_item',
      mode: 'list_only',
      adapter: 'generic',
      summary: { company: '', position, location: null, major: null, publishedAt: null },
      criteria: { openOnly: false },
    }),
  }).select('id');
}
await insertFallbackRaw('c'.repeat(32), '前端开发实习生');
await insertFallbackRaw('d'.repeat(32), '前端开发实习生（备用）');
const fallbackFirst = await call('/api/admin/collect/parse', {
  method: 'POST', body: { rawId: 'c'.repeat(32) },
});
check('list fallback completes weak fields with llm', fallbackFirst.status === 200
  && fallbackFirst.data.parseMode === 'list_llm'
  && fallbackFirst.data.fallback === 'llm_completed'
  && fallbackFirst.data.internship?.company === '字节跳动', fallbackFirst.data);
check('list fallback fills location and classification', fallbackFirst.data.internship?.status === 'confirmed', fallbackFirst.data);
const fallbackCalls = siteCalls.length;
const fallbackSecond = await call('/api/admin/collect/parse', {
  method: 'POST', body: { rawId: 'd'.repeat(32) },
});
check('list fallback respects daily budget', fallbackSecond.status === 200
  && fallbackSecond.data.parseMode === 'list_only'
  && fallbackSecond.data.fallback === 'budget_exhausted'
  && siteCalls.length === fallbackCalls
  && db.tables.get('llm_usage')?.[0]?.calls === 1, fallbackSecond.data);
const metaAfterFallback = await call('/api/meta');
check('collect fallback usage counts toward site quota',
  metaAfterFallback.data.publicLimits.siteCallsToday === usageBeforeFallback + 1,
  { before: usageBeforeFallback, after: metaAfterFallback.data.publicLimits.siteCallsToday });

const discover = await call('/api/admin/collect/sources/discover', {
  method: 'POST', body: { url: 'https://career.example.edu.cn/jobs', name: '示例高校就业网' },
});
check('discover public channel links', discover.status === 200
  && discover.data.candidateCount === 2 && discover.data.candidates[0].detailUrl.includes('/jobs/'), discover.data);

const addedSource = await call('/api/admin/collect/sources/add', {
  method: 'POST', body: { url: 'https://career.example.edu.cn/jobs', name: '示例高校就业网', category: 'campus' },
});
check('add custom source', addedSource.status === 201 && addedSource.data.id && addedSource.data.category === 'campus', addedSource);
const customStatus = await call('/api/admin/collect/status');
check('custom source keeps category', customStatus.data.sources
  .find((source) => source.id === addedSource.data.id)?.category === 'campus', customStatus.data.sources);

const customRun = await call('/api/admin/collect/run', {
  method: 'POST', body: { sourceIds: [addedSource.data.id], page: 1, criteria: { directions: ['数据与算法'] } },
});
check('custom source collect runs', customRun.status === 200
  && customRun.data.results[0]?.queued === 1 && customRun.data.results[0]?.unmatched === 1, customRun.data.results[0]);
const customParsed = await call('/api/admin/collect/parse', {
  method: 'POST', body: { rawId: customRun.data.results[0]?.items?.[0]?.rawId },
});
check('custom source list-only parse', customParsed.status === 200
  && customParsed.data.internship.direction === '数据与算法', customParsed.data);

// GBK 编码公开页：严格 UTF-8 解码失败后必须回退 GBK，否则标题只剩乱码。
const gbkSource = await call('/api/admin/collect/sources/add', {
  method: "POST", body: { url: 'https://career.example.edu.cn/gbk', name: 'GBK 示例页' },
});
const gbkRun = await call('/api/admin/collect/run', {
  method: "POST", body: { sourceIds: [gbkSource.data.id], page: 1 },
});
check('gbk list page decodes via gbk fallback', gbkRun.data.results[0]?.queued === 1
  && String(gbkRun.data.results[0]?.items?.[0]?.position || '').includes(gbkMarkerText), gbkRun.data.results[0]);
await call('/api/admin/collect/sources/remove', { method: "POST", body: { sourceId: gbkSource.data.id } });
check('multi-source run aggregates totals', (() => {
  const run = customRun.data;
  return run.totals.queued === 1;
})(), customRun.data.totals);

const removedSource = await call('/api/admin/collect/sources/remove', {
  method: 'POST', body: { sourceId: addedSource.data.id },
});
check('remove custom source', removedSource.status === 200 && removedSource.data.id === addedSource.data.id, removedSource);

const badSourceUrl = await call('/api/admin/collect/sources/add', {
  method: 'POST', body: { url: 'ftp://example.com/jobs' },
});
check('reject non-http source url', badSourceUrl.status === 422, badSourceUrl.status);

const statusParsed = await call('/api/admin/collect/status');
check('collect status updates raw counts', statusParsed.data.counts.parsed >= 1, statusParsed.data.counts);
check('collect logs recorded', statusParsed.data.recentLogs.length >= 3
  && statusParsed.data.month.totalRequests >= 3, statusParsed.data.month);

const autoBoard = await call('/api/board');
check('collected jobs appear on board without manual confirm', autoBoard.data.rows
  .some((row) => row.id === parsedItem.data.internship.id), autoBoard.data.rows.length);

const parsedConfirmed = await call(`/api/admin/internships/${parsedItem.data.internship.id}/confirm`, {
  method: 'POST', body: { edits: { industry: '互联网/软件' } },
});
check('collect parsed internship can be confirmed', parsedConfirmed.status === 200
  && parsedConfirmed.data.item.status === 'confirmed', parsedConfirmed.data);

const exploreOps = await call('/api/explore?direction=技术');
const bytedance = exploreOps.data.recommendations.companies.find((item) => item.company === '字节跳动');
check('recommendations merge collected jobs', exploreOps.status === 200 && exploreOps.data.totalJobs >= 1
  && bytedance && bytedance.jobCount >= 1, exploreOps.data.recommendations);

const publicQueue = await call('/api/admin/queue');
check('public can read queue', publicQueue.status === 200 && typeof publicQueue.data.counts.pending === 'number', publicQueue);

const pendingBoard = await call('/api/board?includePending=1');
check('board includes pending scope', pendingBoard.status === 200
  && typeof pendingBoard.data.pendingCount === 'number', pendingBoard.status);

const multiExplore = await call('/api/explore?direction=技术,数据与算法');
check('explore accepts multi-value filters', multiExplore.status === 200
  && multiExplore.data.totalJobs >= 2, multiExplore.data.totalJobs);

const llmProbe = await call('/api/admin/llm/test', { method: 'POST', body: {} });
check('llm probe reports model', llmProbe.status === 200
  && typeof llmProbe.data.ok === 'boolean' && Boolean(llmProbe.data.model), llmProbe.data);

const reparse = await call('/api/admin/collect/reparse', { method: 'POST', body: { limit: 5 } });
check('reparse queue reports remaining', reparse.status === 200
  && typeof reparse.data.attempted === 'number'
  && typeof reparse.data.remaining === 'number', reparse.data);

const openRefresh = await call('/api/collect/refresh', { method: 'POST' });
check('on-open refresh records a successful run', openRefresh.status === 200
  && openRefresh.data.refreshed === true
  && openRefresh.data.status === 'success'
  && typeof openRefresh.data.newJobs === 'number', openRefresh.data);
const openRefreshAgain = await call('/api/collect/refresh', { method: 'POST' });
check('on-open refresh skips within ttl', openRefreshAgain.status === 200
  && openRefreshAgain.data.skipped === true
  && openRefreshAgain.data.reason === 'fresh', openRefreshAgain.data);

const refreshRow = db.tables.get('crawl_state')?.[0];
if (refreshRow) {
  refreshRow.last_finished_at = '2020-01-01T00:00:00Z';
  refreshRow.lock_until = '2020-01-01T00:00:00Z';
  refreshRow.updated_at = '2020-01-01T00:00:00Z';
}
const [lockA, lockB] = await Promise.all([
  call('/api/collect/refresh', { method: 'POST' }),
  call('/api/collect/refresh', { method: 'POST' }),
]);
const refreshedCount = [lockA, lockB].filter((item) => item.data?.refreshed === true).length;
const skippedCount = [lockA, lockB].filter((item) => item.data?.skipped === true).length;
check('on-open refresh serializes concurrent runs', lockA.status === 200 && lockB.status === 200
  && refreshedCount === 1 && skippedCount === 1, [lockA.data, lockB.data]);

// 投递追踪：匿名设备、幂等记录、状态流转与删除。
const trackingDevice = 'smoke-device-0001';
const jobsForTracking = await call('/api/jobs?type=intern&pageSize=20');
const trackingJob = jobsForTracking.data.jobs.find((job) => job.company === '美团');
check('tracking has a job to apply', Boolean(trackingJob?.id), jobsForTracking.data);
const emptyTracking = await call(`/api/tracking?deviceId=${trackingDevice}`);
check('tracking starts empty', emptyTracking.status === 200 && emptyTracking.data.rows.length === 0, emptyTracking.data);
const applyOnce = await call('/api/tracking', {
  method: 'POST',
  body: { deviceId: trackingDevice, jobId: trackingJob.id, status: 'applied' },
});
check('tracking records an application', applyOnce.status === 201 && applyOnce.data.application?.status === 'applied', applyOnce.data);
const applyAgain = await call('/api/tracking', {
  method: 'POST',
  body: { deviceId: trackingDevice, jobId: trackingJob.id, status: 'applied' },
});
check('tracking apply is idempotent', applyAgain.status === 200 && applyAgain.data.existing === true, applyAgain.data);
const trackingList = await call(`/api/tracking?deviceId=${trackingDevice}`);
const tracked = trackingList.data.rows?.[0];
check('tracking lists the applied job', tracked?.id === trackingJob.id && tracked?.company, trackingList.data);
const progressed = await call(`/api/tracking/${tracked.applicationId}`, {
  method: 'PATCH',
  body: { deviceId: trackingDevice, status: 'interview' },
});
check('tracking updates progress', progressed.status === 200 && progressed.data.application?.status === 'interview', progressed.data);
const removed = await call(`/api/tracking/${tracked.applicationId}?deviceId=${trackingDevice}`, { method: 'DELETE' });
check('tracking removes an application', removed.status === 200 && removed.data.deleted === true, removed.data);

const badManual = await call('/api/tracking/manual', {
  method: 'POST',
  body: {
    deviceId: trackingDevice, title: '产品实习生', company: '示例科技', externalUrl: 'javascript:alert(1)',
  },
});
check('manual tracking rejects unsafe links', badManual.status === 400
  && badManual.data.error?.code === 'invalid_input', badManual.data);
const manualCreated = await call('/api/tracking/manual', {
  method: 'POST',
  body: {
    deviceId: trackingDevice,
    title: '产品实习生',
    company: '示例科技',
    externalUrl: 'https://example.com/job/123',
    initialStatus: 'applied',
    notes: 'HR 邮箱 hr@example.com',
  },
});
check('manual tracking creates a self-owned record', manualCreated.status === 201
  && manualCreated.data.application?.isManual === true
  && manualCreated.data.application?.source === 'manual'
  && manualCreated.data.application?.position === '产品实习生'
  && manualCreated.data.application?.applyLink === 'https://example.com/job/123', manualCreated.data);
const manualList = await call(`/api/tracking?deviceId=${trackingDevice}`);
check('manual tracking is listed beside tracked rows', manualList.data.rows?.length === 1
  && manualList.data.rows[0]?.isManual === true, manualList.data);
const manualId = manualCreated.data.application.applicationId;
const manualProgress = await call(`/api/tracking/${manualId}`, {
  method: 'PATCH', body: { deviceId: trackingDevice, status: 'interview' },
});
check('manual tracking reuses the status machine', manualProgress.status === 200
  && manualProgress.data.application?.status === 'interview'
  && manualProgress.data.application?.isManual === true, manualProgress.data);
const manualEdited = await call(`/api/tracking/manual/${manualId}`, {
  method: 'PATCH',
  body: {
    deviceId: trackingDevice,
    title: '产品运营实习生',
    company: '示例科技',
    externalUrl: 'https://example.com/job/456',
    notes: '改约周四面试',
  },
});
check('manual tracking can be edited', manualEdited.status === 200
  && manualEdited.data.application?.position === '产品运营实习生'
  && manualEdited.data.application?.notes === '改约周四面试', manualEdited.data);
const manualRemoved = await call(`/api/tracking/${manualId}?deviceId=${trackingDevice}`, { method: 'DELETE' });
check('manual tracking can be removed', manualRemoved.status === 200
  && manualRemoved.data.deleted === true, manualRemoved.data);

const manualTooFew = await call('/api/tracking/manual', {
  method: 'POST',
  body: { deviceId: trackingDevice, title: '只有岗位名' },
});
check('manual tracking needs two identity fields', manualTooFew.status === 400
  && manualTooFew.data.error?.code === 'invalid_input', manualTooFew.data);
const manualTwoOfThree = await call('/api/tracking/manual', {
  method: 'POST',
  body: {
    deviceId: trackingDevice,
    title: '无公司岗位',
    externalUrl: 'https://example.com/job/789',
    initialStatus: 'to_apply',
  },
});
check('manual tracking accepts two of three identity fields', manualTwoOfThree.status === 201
  && manualTwoOfThree.data.application?.position === '无公司岗位'
  && manualTwoOfThree.data.application?.company === '未填写公司'
  && manualTwoOfThree.data.application?.applyLink === 'https://example.com/job/789', manualTwoOfThree.data);
const twoOfThreeId = manualTwoOfThree.data.application?.applicationId;
if (twoOfThreeId) {
  await call(`/api/tracking/${twoOfThreeId}?deviceId=${trackingDevice}`, { method: 'DELETE' });
}

// P1：链接识别、方向组/企业性质筛选、grandTotal、来源归一与 saved 状态。
const contractRows = [
  {
    id: '1'.repeat(32), company: '灯塔科技有限公司', position_title: '后端开发实习生', location: '北京',
    position_type: '实习', is_intern: 1, status: 'confirmed', company_nature: '民企',
    apply_link: 'https://newjob.ncss.cn/student/jobs/9PdSWokuayRbxjoE64r4QH/detail.html',
    source_url: 'https://newjob.ncss.cn/student/jobs/9PdSWokuayRbxjoE64r4QH/detail.html',
    source_name: '国家大学生就业服务平台', confidence: 0.9, source_model: 'collect_v1',
    source_prompt_version: 'collect_v1', created_at: '2026-11-15T10:00:00Z', updated_at: '2026-11-15T10:00:00Z',
  },
  {
    id: '2'.repeat(32), company: '灯塔科技有限公司', position_title: '后端开发实习生', location: '上海',
    position_type: '实习', is_intern: 1, status: 'confirmed', company_nature: '民企',
    apply_link: 'https://www.yingjiesheng.com/job-008-149-323.html',
    source_url: 'https://www.yingjiesheng.com/job-008-149-323.html',
    source_name: '应届生求职网专业频道', confidence: 0.8, source_model: 'collect_v1',
    source_prompt_version: 'collect_v1', created_at: '2026-11-15T10:00:00Z', updated_at: '2026-11-15T10:00:00Z',
  },
  {
    id: '3'.repeat(32), company: '蓝海数据有限公司', position_title: '数据分析实习生', location: '杭州',
    position_type: '实习', is_intern: 1, status: 'confirmed', company_nature: '国企',
    apply_link: 'https://www.yingjiesheng.com/job-008-149-324.html',
    source_url: 'https://www.yingjiesheng.com/job-008-149-324.html',
    source_name: '应届生求职网专业频道', confidence: 0.85, source_model: 'collect_v1',
    source_prompt_version: 'collect_v1', created_at: '2026-11-15T10:00:00Z', updated_at: '2026-11-15T10:00:00Z',
  },
  {
    id: '4'.repeat(32), company: '聚合招聘页有限公司', position_title: '综合管理培训生', location: '北京',
    position_type: '实习', is_intern: 1, status: 'confirmed', company_nature: '事业单位',
    apply_link: 'https://example.com/search/jobs?q=intern',
    source_url: 'https://example.com/search/jobs?q=intern',
    source_name: '示例高校就业网', confidence: 0.7, source_model: 'collect_v1',
    source_prompt_version: 'collect_v1', created_at: '2026-11-15T10:00:00Z', updated_at: '2026-11-15T10:00:00Z',
  },
  {
    id: '5'.repeat(32), company: '某某制造有限公司', position_title: '储备干部', location: '苏州',
    position_type: '校招', is_intern: 0, status: 'confirmed', company_nature: '民企',
    apply_link: 'https://www.yingjiesheng.com/job-008-149-325.html',
    source_url: 'https://www.yingjiesheng.com/job-008-149-325.html',
    source_name: '应届生求职网', confidence: 0.8, source_model: 'collect_v1',
    source_prompt_version: 'collect_v1', created_at: '2026-11-15T10:00:00Z', updated_at: '2026-11-15T10:00:00Z',
  },
];
const contractImport = await call('/api/admin/import', { method: 'POST', body: { internships: contractRows } });
check('P1 fixtures imported', contractImport.status === 200 && contractImport.data.internships === 5, contractImport);

const ncssJob = await call('/api/jobs?company=%E7%81%AF%E5%A1%94%E7%A7%91%E6%8A%80%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8');
check('ncss alphanumeric detail link is job_detail', ncssJob.data.jobs.length === 1
  && ncssJob.data.jobs[0].linkKind === 'job_detail', ncssJob.data.jobs);
check('duplicate company+position merges cities', ncssJob.data.jobs[0].cities.includes('北京')
  && ncssJob.data.jobs[0].cities.includes('上海'), ncssJob.data.jobs[0]?.cities);
check('direction group facet and filter', ncssJob.data.facets.directionGroups['技术与数据'] === 1
  && ncssJob.data.jobs[0].directionGroup === '技术与数据', ncssJob.data.facets);
check('company nature facet and filter', ncssJob.data.facets.natures['民企'] === 1
  && ncssJob.data.jobs[0].companyNature === '民企', ncssJob.data.facets);
const groupFiltered = await call('/api/jobs?type=all&directionGroup=%E6%8A%80%E6%9C%AF%E4%B8%8E%E6%95%B0%E6%8D%AE&company=%E7%81%AF%E5%A1%94%E7%A7%91%E6%8A%80%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8');
check('directionGroup query filters jobs', groupFiltered.data.total === 1, groupFiltered.data);
const natureFiltered = await call('/api/jobs?type=all&nature=%E5%9B%BD%E4%BC%81&company=%E8%93%9D%E6%B5%B7%E6%95%B0%E6%8D%AE%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8');
check('nature query filters jobs', natureFiltered.data.total === 1, natureFiltered.data);
const unsetNature = await call('/api/jobs?type=all&nature=%E6%9C%AA%E6%A0%87%E6%B3%A8&company=%E7%BE%8E%E5%9B%A2');
check('nature 未标注 matches rows without company_nature', unsetNature.data.total === 1
  && unsetNature.data.jobs[0]?.companyNature === null, unsetNature.data);
const directionSearch = await call('/api/jobs?type=all&q=%E6%95%B0%E6%8D%AE%E4%B8%8E%E7%AE%97%E6%B3%95');
check('search matches direction keyword', directionSearch.data.jobs.some((job) => job.company === '美团'), directionSearch.data.jobs);
const defaultJobs = await call('/api/jobs');
check('grandTotal ignores filters', defaultJobs.data.grandTotal === ncssJob.data.grandTotal
  && ncssJob.data.grandTotal > ncssJob.data.total, {
  default: defaultJobs.data.grandTotal, filtered: ncssJob.data.grandTotal,
});
const legacySource = await call('/api/jobs?type=all&company=%E8%93%9D%E6%B5%B7%E6%95%B0%E6%8D%AE%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8');
check('legacy source name normalized in API', legacySource.data.jobs[0]?.sourceName === '应届生求职网',
  legacySource.data.jobs[0]?.sourceName);
const fallbackDirection = await call('/api/jobs?type=all&company=%E6%9F%90%E6%9F%90%E5%88%B6%E9%80%A0%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8');
check('direction is not hard-filled from industry', fallbackDirection.data.jobs[0]?.industry === '制造'
  && fallbackDirection.data.jobs[0]?.direction === null, fallbackDirection.data.jobs[0]);

const nonTrackable = await call('/api/jobs?type=all&company=%E8%81%9A%E5%90%88%E6%8B%9B%E8%81%98%E9%A1%B5%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8');
const blockedTracking = await call('/api/tracking', {
  method: 'POST', body: { deviceId: 'smoke-device-contract', jobId: nonTrackable.data.jobs[0].id, status: 'applied' },
});
check('non-specific job link cannot be tracked', blockedTracking.status === 409
  && blockedTracking.data.error?.code === 'not_trackable', blockedTracking.data);

const savedJob = legacySource.data.jobs[0];
const savedOnce = await call('/api/tracking', {
  method: 'POST', body: { deviceId: 'smoke-device-saved', jobId: savedJob.id, status: 'saved' },
});
check('tracking records saved status', savedOnce.status === 201
  && savedOnce.data.application?.status === 'saved'
  && savedOnce.data.application?.appliedAt === null, savedOnce.data);
const savedList = await call('/api/tracking?deviceId=smoke-device-saved');
check('saved status label and transitions', savedList.data.rows[0]?.statusLabel === '已收藏'
  && savedList.data.rows[0]?.allowedTransitions.some((item) => item.key === 'applied'), savedList.data.rows[0]);
const savedToApplied = await call(`/api/tracking/${savedOnce.data.application.applicationId}`, {
  method: 'PATCH', body: { deviceId: 'smoke-device-saved', status: 'applied' },
});
check('saved can transition to applied', savedToApplied.status === 200
  && savedToApplied.data.application?.status === 'applied'
  && Boolean(savedToApplied.data.application?.appliedAt), savedToApplied.data);
await call(`/api/tracking/${savedOnce.data.application.applicationId}?deviceId=smoke-device-saved`, { method: 'DELETE' });

console.log(failures ? `\n${failures} failure(s)` : '\nALL SMOKE TESTS PASSED');
process.exit(failures ? 1 : 0);
