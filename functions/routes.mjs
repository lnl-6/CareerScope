import {
  PAGE_SIZE, POSITION_TYPE_VALUES, COMPANY_NATURE_VALUES, DEADLINE_PROXIMITY_VALUES,
  APPLICATION_STATUS_LABELS, APPLICATION_STATUS_ORDER, ALLOWED_APPLICATION_TRANSITIONS,
  DIRECTIONS, INDUSTRIES,
  DIRECTION_GROUPS, MAJOR_GROUPS, COLLECT_CITIES, EXPERIMENT_MODELS,
  EXPERIMENT_DEFAULTS, readJsonBody, displayMoment, optText,
  PUBLIC_SITE_MAX_SAMPLES, PUBLIC_SITE_MAX_MODELS,
  classifyJob, parseSalary, directionGroupOf, splitCities, companyKey, linkKind,
  canonicalSourceName, jobDedupeKey, mergeLocations, uuid, isoSeconds, todayIso,
} from './core.mjs';
import {
  DB_MAX_ROWS, loadInternshipsAll, loadApplications, loadModelLabels,
  loadDeviceApplications, loadDeviceApplication, getInternshipById, mapDeviceApplication,
  buildBoardMeta, boardRow,
  listPromptVersions, listSampleSets, listExperiments, getExperiment, getSampleSet,
  listResults, averageSecondsPerSample, getActivePromptVersion,
} from './store.mjs';
import {
  queueSnapshot, confirmInternship, discardInternship, backfillDirections,
  createApplication, transitionApplication, markExpired, importSeed,
  maintainClassification, rollbackMaintenance,
} from './review.mjs';
import {
  importSampleSet, exportConfirmedAsSampleSet, createExperiment, runBatch,
  abandonExperiment, exportMarkdownReport, rollbackPromptVersion, siteQuotaSnapshot,
} from './experiments.mjs';
import {
  collectList, collectRun, parseCollectedItem, collectStatus,
  addSource, removeSource, setSourceEnabled, discoverSource, reparseQueue, refreshOnOpen,
  runDailyCollect,
} from './collect.mjs';
import { recommendCompanies } from './recommend.mjs';
import { probeLlm } from './core.mjs';

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function deprecatedJson(data) {
  return Response.json(data, {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      deprecation: 'true',
      link: '</api/jobs>; rel="successor-version"',
    },
  });
}

function fail(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.expose = true;
  throw error;
}

const INPUT_ERRORS = {
  invalid_input: [400, '请求格式不正确，请刷新页面后重试。'],
  payload_too_large: [413, '提交内容过大，请减少样本数量后重试。'],
};

function parseInputFail(error) {
  const mapped = INPUT_ERRORS[error.message];
  if (mapped) fail(mapped[0], error.message, mapped[1]);
  throw error;
}

async function parseBody(request) {
  try {
    return await readJsonBody(request);
  } catch (error) {
    parseInputFail(error);
  }
}

const ID_RE = /^[0-9a-fA-F]{32}$|^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// 环境令牌用于日常轮换；内置哈希令牌保留为自动化维护入口。
const ADMIN_TOKEN_SHA256 = '335d54064fb5a5aefad4e594136efe0af26d2046cb21beeee907d983d61bc81f';

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function requireAdmin(request) {
  const expected = globalThis.Deno?.env?.get?.('INTERNRADAR_ADMIN_TOKEN') || '';
  if (!expected && globalThis.Deno?.env?.get?.('INTERNRADAR_LOCAL_DEV') === '1') return;
  const provided = request.headers.get('x-admin-token') || '';
  if (expected && provided === expected) return;
  if (provided && (await sha256Hex(provided)) === ADMIN_TOKEN_SHA256) return;
  fail(401, 'unauthorized', '管理员令牌不正确。');
}

// 数据源标识：内置源为短名（ncss/yjs），自定义源为 UUID。
function sourceIdParam(value) {
  const text = String(value || '').trim();
  if (!/^[a-z0-9_-]{1,64}$/.test(text)) fail(400, 'invalid_input', '数据源标识不合法。');
  return text;
}

function idParam(value, label) {
  if (!ID_RE.test(String(value || ''))) fail(400, 'invalid_input', `${label} 标识不合法。`);
  return value;
}

async function loadJobRows(db, { type = 'intern', company = '', includePending = false } = {}) {
  const normalizedType = ['intern', 'campus', 'all'].includes(type) ? type : 'intern';
  const filters = normalizedType === 'intern'
    ? { isIntern: true }
    : normalizedType === 'campus'
      ? { positionType: '校招' }
      : {};
  if (company) filters.company = company;
  const { rows, truncated } = await loadInternshipsAll(db, filters);
  const allowedStatus = (item) => item.status === 'confirmed'
    || (includePending && item.status === 'pending_review');
  return {
    type: normalizedType,
    jobs: rows.filter(allowedStatus),
    truncated,
  };
}

async function boardPayload(db, includePending, includeApplications) {
  const { jobs: internships } = await loadJobRows(db, { type: 'all', includePending });
  const applications = includeApplications ? await loadApplications(db) : new Map();
  const labels = await loadModelLabels(db);
  const rows = internships.map((item) => boardRow(item, applications.get(item.id), labels));
  return {
    generatedAt: displayMoment(),
    dataMode: 'live',
    meta: { ...buildBoardMeta(internships), pageSize: PAGE_SIZE },
    rows,
    pendingCount: internships.filter((item) => item.status === 'pending_review').length,
  };
}

function publicJobRow(item) {
  const cities = splitCities(item.location);
  return {
    id: item.id,
    company: item.company,
    position: item.position,
    location: item.location,
    cities,
    positionType: item.position_type,
    isIntern: item.is_intern,
    majorRequirements: item.major_requirements,
    deadline: item.deadline,
    deadlineRaw: item.deadline_raw,
    pay: item.pay,
    salary: parseSalary(item.pay),
    publishedAt: item.published_at,
    fetchedAt: item.created_at,
    applyLink: item.apply_link,
    linkKind: classifyJob({
      company: item.company,
      position: item.position,
      location: item.location,
      applyLink: item.apply_link || item.source_url,
      sourceUrl: item.source_url,
    }).link_kind,
    direction: item.direction || null,
    directionGroup: directionGroupOf(item.direction),
    industry: item.industry || null,
    industrySource: item.industry_source ?? null,
    companyNature: item.company_nature || null,
    confidence: item.confidence,
    sourceName: canonicalSourceName(item.source_name),
    sourceUrl: item.source_url,
    createdAt: item.created_at,
  };
}

function publicExploreRow(item) {
  return publicJobRow(item);
}

function listParam(value, max = 8) {
  return [...new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean))].slice(0, max);
}

const DEVICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function deviceIdParam(value) {
  const text = String(value || '').trim();
  if (!DEVICE_ID_RE.test(text)) fail(400, 'invalid_input', '设备标识不合法，请刷新页面后重试。');
  return text;
}

function transitionOptions(status) {
  return (ALLOWED_APPLICATION_TRANSITIONS[status] || [])
    .map((key) => ({ key, label: APPLICATION_STATUS_LABELS[key] || key }));
}

// 平台迁移不支持修改列可空性，自建记录用 manual:<uuid> 占位，共用同一张表与唯一约束。
const MANUAL_ID_PREFIX = 'manual:';

function isManualApplication(application) {
  return application?.source === 'manual'
    || String(application?.internship_id || '').startsWith(MANUAL_ID_PREFIX);
}

function trackingFields(application) {
  return {
    applicationId: application.id,
    status: application.status,
    statusLabel: APPLICATION_STATUS_LABELS[application.status] || application.status,
    statusHistory: application.status_history,
    allowedTransitions: transitionOptions(application.status),
    notes: application.notes,
    appliedAt: application.applied_at,
    trackingUpdatedAt: application.updated_at,
  };
}

function trackingRow(application, job) {
  return {
    ...publicJobRow(job),
    ...trackingFields(application),
    source: 'tracked',
    isManual: false,
  };
}

function manualSnapshot(application, { orphan = false } = {}) {
  const externalUrl = application.external_url || null;
  return {
    id: null,
    manualTitle: application.title || null,
    manualCompany: application.company || null,
    manualExternalUrl: externalUrl,
    company: application.company || (orphan ? '公司信息已移除' : '未填写公司'),
    position: application.title || (orphan ? '岗位已下线' : '未命名岗位'),
    location: null,
    cities: [],
    positionType: null,
    isIntern: false,
    majorRequirements: null,
    deadline: null,
    deadlineRaw: null,
    pay: null,
    salary: null,
    publishedAt: null,
    fetchedAt: application.created_at,
    applyLink: externalUrl,
    linkKind: null,
    direction: null,
    directionGroup: null,
    industry: null,
    industrySource: null,
    companyNature: null,
    confidence: 0,
    sourceName: orphan ? '已下线岗位' : '手动添加',
    sourceUrl: externalUrl || '',
    createdAt: application.created_at,
  };
}

function manualTrackingRow(application) {
  return {
    ...manualSnapshot(application),
    ...trackingFields(application),
    source: 'manual',
    isManual: true,
  };
}

function orphanTrackingRow(application) {
  return {
    ...manualSnapshot(application, { orphan: true }),
    ...trackingFields(application),
    source: 'tracked',
    isManual: false,
    isOrphaned: true,
  };
}

function applicationTrackingRow(application, job) {
  if (isManualApplication(application)) return manualTrackingRow(application);
  if (job) return trackingRow(application, job);
  return orphanTrackingRow(application);
}

function manualField(value, label, maxLength) {
  const text = optText(value);
  if (!text) return null;
  if (text.length > maxLength) fail(400, 'invalid_input', `${label}不能超过 ${maxLength} 个字符。`);
  return text;
}

function manualIdentityCount(fields) {
  return [fields.title, fields.company, fields.external_url].filter(Boolean).length;
}

function manualExternalUrl(value) {
  const text = optText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('invalid_protocol');
    return url.toString();
  } catch {
    fail(400, 'invalid_input', '投递链接需要是有效的 http/https 地址。');
  }
}

async function trackingPayload(db, deviceId) {
  const [applications, { rows: internships }] = await Promise.all([
    loadDeviceApplications(db, deviceId),
    loadInternshipsAll(db, {}),
  ]);
  const jobs = new Map(internships
    .filter((item) => item.status === 'confirmed')
    .map((item) => [item.id, item]));
  const rows = applications
    .map((application) => applicationTrackingRow(application, jobs.get(application.internship_id)))
    .sort((a, b) => String(b.trackingUpdatedAt).localeCompare(String(a.trackingUpdatedAt)));
  return { generatedAt: displayMoment(), deviceId, rows };
}

async function jobsPayload(db, {
  type = 'intern', q = '', directions = [], directionGroups = [], industries = [], cities = [],
  natures = [], company = '', page = 1, pageSize = 24,
} = {}) {
  const { type: normalizedType, jobs, truncated } = await loadJobRows(db, { type });
  const query = String(q || '').trim().toLowerCase();
  const companyFilter = String(company || '').trim();
  const companyKeyFilter = companyFilter ? companyKey(companyFilter) : '';
  const cityFilters = cities.map((city) => String(city).trim()).filter(Boolean);

  // 公司+岗位去重：同一岗位跨城市只在列表出现一次，城市合并展示，避免重复占位。
  const grouped = new Map();
  const merged = [];
  for (const job of jobs) {
    const key = jobDedupeKey(job.company, job.position);
    if (!key) {
      merged.push(job);
      continue;
    }
    const current = grouped.get(key);
    if (!current) {
      const entry = { ...job };
      grouped.set(key, entry);
      merged.push(entry);
      continue;
    }
    current.location = mergeLocations(current.location, job.location);
    if (String(job.updated_at || '').localeCompare(String(current.updated_at || '')) > 0) {
      const locations = current.location;
      Object.assign(current, job, { location: locations });
    }
  }

  const matches = merged
    .filter((item) => {
      if (companyKeyFilter && companyKey(item.company) !== companyKeyFilter) return false;
      if (query) {
        const haystack = `${item.company} ${item.position} ${item.direction || ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (directions.length && !directions.includes(item.direction)) return false;
      if (directionGroups.length && !directionGroups.includes(directionGroupOf(item.direction))) return false;
      if (industries.length && !industries.includes(item.industry)) return false;
      if (natures.length) {
        const wantsUnset = natures.includes('未标注');
        const nature = item.company_nature || '';
        if (!(nature && natures.includes(nature)) && !(wantsUnset && !nature)) return false;
      }
      if (cityFilters.length) {
        const itemCities = splitCities(item.location);
        if (!cityFilters.some((city) => itemCities.includes(city))) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const leftCities = splitCities(a.location).length;
      const rightCities = splitCities(b.location).length;
      const leftRank = leftCities === 1 ? 0 : leftCities > 1 ? 1 : 2;
      const rightRank = rightCities === 1 ? 0 : rightCities > 1 ? 1 : 2;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return String(b.updated_at).localeCompare(String(a.updated_at));
    });

  const facets = {
    directions: {}, directionGroups: {}, industries: {}, cities: {}, natures: {},
  };
  for (const item of matches) {
    if (item.direction) facets.directions[item.direction] = (facets.directions[item.direction] || 0) + 1;
    const group = directionGroupOf(item.direction);
    if (group) facets.directionGroups[group] = (facets.directionGroups[group] || 0) + 1;
    if (item.industry) facets.industries[item.industry] = (facets.industries[item.industry] || 0) + 1;
    if (item.company_nature) facets.natures[item.company_nature] = (facets.natures[item.company_nature] || 0) + 1;
    for (const city of splitCities(item.location)) facets.cities[city] = (facets.cities[city] || 0) + 1;
  }
  const companyMap = new Map();
  for (const item of matches) {
    const key = companyKey(item.company) || item.company;
    const entry = companyMap.get(key) || {
      name: item.company, key, count: 0, cities: new Set(), directions: new Set(), industries: new Set(),
    };
    entry.count += 1;
    for (const city of splitCities(item.location)) entry.cities.add(city);
    if (item.direction) entry.directions.add(item.direction);
    if (item.industry) entry.industries.add(item.industry);
    companyMap.set(key, entry);
  }
  const companies = [...companyMap.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, 24)
    .map((entry) => ({
      name: entry.name,
      key: entry.key,
      count: entry.count,
      cities: [...entry.cities],
      directions: [...entry.directions],
      industries: [...entry.industries],
    }));

  const safePageSize = Math.min(Math.max(Number(pageSize) || 24, 1), 60);
  const safePage = Math.max(Number(page) || 1, 1);
  const start = (safePage - 1) * safePageSize;
  return {
    generatedAt: displayMoment(),
    type: normalizedType,
    grandTotal: merged.length,
    total: matches.length,
    page: safePage,
    pageSize: safePageSize,
    hasMore: start + safePageSize < matches.length,
    truncated,
    filters: {
      q: query, directions, directionGroups, industries, cities, natures, company,
    },
    facets,
    companies,
    jobs: matches.slice(start, start + safePageSize).map(publicJobRow),
  };
}

async function explorePayload(db, { directions = [], industries = [], locations = [], limit }) {
  const { jobs: confirmed } = await loadJobRows(db, { type: 'intern' });
  const directionHit = (item) => !directions.length || directions.includes(item.direction);
  const industryHit = (item) => !industries.length || industries.includes(item.industry);
  const locationHit = (item) => !locations.length
    || locations.some((keyword) => (item.location || '').includes(keyword));
  const matches = confirmed
    .filter((item) => directionHit(item) && industryHit(item) && locationHit(item))
    .sort((a, b) => {
      const left = a.deadline || '9999-12-31';
      const right = b.deadline || '9999-12-31';
      if (left !== right) return left < right ? -1 : 1;
      return String(b.updated_at).localeCompare(String(a.updated_at));
    });
  const facets = {
    directions: {}, industries: {}, locations: {},
    directionTotal: 0, industryTotal: 0, locationTotal: 0,
  };
  for (const item of confirmed) {
    if (locationHit(item) && industryHit(item)) {
      facets.directionTotal += 1;
      if (item.direction) facets.directions[item.direction] = (facets.directions[item.direction] || 0) + 1;
    }
    if (locationHit(item) && directionHit(item)) {
      facets.industryTotal += 1;
      if (item.industry) facets.industries[item.industry] = (facets.industries[item.industry] || 0) + 1;
    }
    if (directionHit(item) && industryHit(item)) {
      facets.locationTotal += 1;
      if (item.location) facets.locations[item.location] = (facets.locations[item.location] || 0) + 1;
    }
  }
  return {
    filters: { directions, industries, locations },
    totalJobs: matches.length,
    jobs: matches.slice(0, 60).map(publicExploreRow),
    facets,
    recommendations: recommendCompanies(matches, { limit }),
  };
}

function publicExperiment(experiment, sampleSet) {
  const config = { ...(experiment.config || {}) };
  const progress = config._progress || null;
  delete config._progress;
  delete config._skipped_total;
  delete config._site_calls;
  delete config._site_calls_day;
  return {
    id: experiment.id,
    sampleSetId: experiment.sample_set_id,
    sampleSetName: sampleSet ? sampleSet.name : null,
    kind: experiment.kind,
    config,
    progress: progress ? {
      variantIndex: progress.variantIndex,
      offset: progress.offset,
      skipped: progress.skipped,
    } : null,
    status: experiment.status,
    note: experiment.note,
    createdAt: experiment.created_at,
    finishedAt: experiment.finished_at,
  };
}

async function metaPayload(db) {
  await getActivePromptVersion(db);
  const [promptVersions, sampleSets, experiments, seconds, quota] = await Promise.all([
    listPromptVersions(db),
    listSampleSets(db),
    listExperiments(db),
    averageSecondsPerSample(db),
    siteQuotaSnapshot(db),
  ]);
  const setNames = new Map(sampleSets.map((set) => [set.id, set.name]));
  return {
    models: [...EXPERIMENT_MODELS],
    defaults: {
      temperature: EXPERIMENT_DEFAULTS.temperature,
      maxTokens: EXPERIMENT_DEFAULTS.maxTokens,
      pricePer1kTokens: EXPERIMENT_DEFAULTS.pricePer1kTokens,
    },
    publicLimits: {
      siteDailyCallLimit: quota.limit,
      siteCallsToday: quota.used,
      siteRemaining: quota.remaining,
      siteMaxSamples: PUBLIC_SITE_MAX_SAMPLES,
      siteMaxModels: PUBLIC_SITE_MAX_MODELS,
    },
    promptVersions: promptVersions.map((version) => ({
      versionId: version.version_id,
      triggerReason: version.trigger_reason,
      accuracyImprovement: version.accuracy_improvement,
      fewShotCount: version.few_shot_samples.length,
      createdAt: version.created_at,
      isActive: version.is_active,
    })),
    sampleSets: sampleSets.map((set) => ({
      id: set.id,
      name: set.name,
      sourceType: set.source_type,
      count: set.samples.length,
      createdAt: set.created_at,
    })),
    experiments: experiments.map((experiment) => publicExperiment(experiment, {
      name: setNames.get(experiment.sample_set_id),
    })),
    averageSecondsPerSample: Number(seconds.toFixed(2)),
    limits: { sampleSetMin: 10, sampleSetMax: 100, errorCaseMax: 5, promptVersionKeep: 10 },
    directions: [...DIRECTIONS],
    directionGroups: DIRECTION_GROUPS.map((entry) => ({ group: entry.group, items: [...entry.items] })),
    majorGroups: MAJOR_GROUPS.map((entry) => ({ group: entry.group, majors: entry.majors.map(([name]) => name) })),
    collectCities: COLLECT_CITIES.map((city) => city.name),
    industries: [...INDUSTRIES],
    positionTypes: [...POSITION_TYPE_VALUES],
    companyNatures: [...COMPANY_NATURE_VALUES],
    deadlineBuckets: [...DEADLINE_PROXIMITY_VALUES],
    applyStatusLabels: APPLICATION_STATUS_ORDER.map((key) => APPLICATION_STATUS_LABELS[key]),
  };
}

async function experimentDetail(db, experimentId) {
  const experiment = await getExperiment(db, experimentId);
  if (!experiment) fail(404, 'not_found', '实验不存在。');
  const [results, sampleSet] = await Promise.all([
    listResults(db, experimentId),
    getSampleSet(db, experiment.sample_set_id),
  ]);
  return {
    experiment: publicExperiment(experiment, sampleSet),
    sampleSet: sampleSet ? {
      id: sampleSet.id, name: sampleSet.name, sourceType: sampleSet.source_type, count: sampleSet.samples.length,
    } : null,
    results: results.map((result) => ({
      id: result.id,
      modelName: result.model_name,
      promptVersion: result.run_config.prompt_version,
      temperature: result.run_config.temperature,
      maxTokens: result.run_config.max_tokens,
      runStatus: result.run_status,
      perFieldAccuracy: result.per_field_accuracy,
      overallAccuracy: result.overall_accuracy,
      overallRecall: result.overall_recall,
      nullRateByField: result.null_rate_by_field,
      errorCases: result.error_cases,
      runDurationMs: result.run_duration_ms,
      tokenCost: result.token_cost,
      createdAt: result.created_at,
    })),
  };
}

export function application({ db, llm, fetcher = fetch }) {
  return async (ctx) => {
    const request = ctx.request;
    try {
      const pathname = new URL(request.url).pathname;
      const match = pathname.match(/^\/(?:functions\/v1\/)?(?:app|app-d[0-9a-f]{32})(\/.*)?$/);
      if (!match) fail(404, 'not_found', '接口不存在。');
      const path = match[1] || '/';
      const method = request.method;

      if (path === '/api/health' && method === 'GET') return json({ ok: true });

      // 唯一岗位数据出口；explore/board 仅保留为兼容薄壳。
      if (path === '/api/jobs' && method === 'GET') {
        const params = new URL(request.url).searchParams;
        return json(await jobsPayload(db, {
          type: params.get('type') || 'intern',
          q: params.get('q') || '',
          directions: listParam(params.get('direction')),
          directionGroups: listParam(params.get('directionGroup'), 3),
          industries: listParam(params.get('industry')),
          cities: listParam(params.get('city'), 12),
          natures: listParam(params.get('nature'), 4),
          company: params.get('company') || '',
          page: Number(params.get('page')) || 1,
          pageSize: Number(params.get('pageSize')) || 24,
        }));
      }

      if (path === '/api/tracking' && method === 'GET') {
        const params = new URL(request.url).searchParams;
        return json(await trackingPayload(db, deviceIdParam(params.get('deviceId'))));
      }

      if (path === '/api/tracking/manual' && method === 'POST') {
        const body = await parseBody(request);
        const deviceId = deviceIdParam(body?.deviceId);
        const title = manualField(body?.title, '岗位名', 120);
        const company = manualField(body?.company, '公司名', 120);
        const externalUrl = manualExternalUrl(body?.externalUrl ?? body?.external_url);
        if (manualIdentityCount({ title, company, external_url: externalUrl }) < 2) {
          fail(400, 'invalid_input', '岗位名、公司名、投递链接至少填写两项。');
        }
        const requestedStatus = body?.initialStatus ?? body?.initial_status;
        const status = requestedStatus === undefined ? 'applied' : String(requestedStatus);
        if (!APPLICATION_STATUS_ORDER.includes(status)) fail(400, 'invalid_input', '投递状态不合法。');
        const now = isoSeconds(new Date());
        const id = uuid();
        const record = {
          id,
          device_id: deviceId,
          internship_id: `${MANUAL_ID_PREFIX}${id}`,
          title,
          company,
          external_url: externalUrl,
          source: 'manual',
          status,
          status_history: JSON.stringify([{ status, at: now }]),
          notes: optText(body?.notes)?.slice(0, 500) ?? null,
          applied_at: status === 'saved' || status === 'to_apply' ? null : todayIso(),
          created_at: now,
          updated_at: now,
        };
        await db.from('device_applications').insert(record).select('id');
        return json({ application: manualTrackingRow(mapDeviceApplication(record)) }, 201);
      }

      const manualAction = path.match(/^\/api\/tracking\/manual\/([^/]+)$/);
      if (manualAction && method === 'PATCH') {
        const applicationId = idParam(manualAction[1], '投递记录');
        const application = await loadDeviceApplication(db, applicationId);
        if (!application) fail(404, 'not_found', '投递记录不存在。');
        if (!isManualApplication(application)) fail(404, 'not_found', '自建投递记录不存在。');
        const body = await parseBody(request);
        const deviceId = deviceIdParam(body?.deviceId);
        if (application.device_id !== deviceId) fail(403, 'forbidden', '无权修改该投递记录。');
        const patch = { updated_at: isoSeconds(new Date()) };
        if (body?.title !== undefined) patch.title = manualField(body.title, '岗位名', 120);
        if (body?.company !== undefined) patch.company = manualField(body.company, '公司名', 120);
        if (body?.externalUrl !== undefined || body?.external_url !== undefined) {
          patch.external_url = manualExternalUrl(body.externalUrl ?? body.external_url);
        }
        if (body?.notes !== undefined) patch.notes = optText(body.notes)?.slice(0, 500) ?? null;
        if (manualIdentityCount({ ...application, ...patch }) < 2) {
          fail(400, 'invalid_input', '岗位名、公司名、投递链接至少保留两项。');
        }
        await db.from('device_applications').update(patch).eq('id', applicationId).select('id');
        return json({ application: manualTrackingRow(mapDeviceApplication({ ...application, ...patch })) });
      }

      if (path === '/api/tracking' && method === 'POST') {
        const body = await parseBody(request);
        const deviceId = deviceIdParam(body?.deviceId);
        const jobId = String(body?.jobId || '').trim();
        if (!jobId) fail(400, 'invalid_input', '缺少岗位标识。');
        const job = await getInternshipById(db, jobId);
        if (!job || job.status !== 'confirmed') fail(404, 'not_found', '岗位不存在或尚未公开。');
        if (linkKind(job.apply_link || job.source_url, job.source_url) !== 'job_detail') {
          fail(409, 'not_trackable', '该岗位只有来源页链接，暂不支持投递追踪。');
        }
        const existingRows = (await loadDeviceApplications(db, deviceId))
          .filter((item) => item.internship_id === jobId);
        if (existingRows.length) {
          return json({ application: trackingRow(existingRows[0], job), existing: true });
        }
        const status = APPLICATION_STATUS_ORDER.includes(body?.status) ? body.status : 'applied';
        const now = isoSeconds(new Date());
        const appliedAt = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.appliedAt || ''))
          ? String(body.appliedAt) : todayIso();
        const record = {
          id: uuid(),
          device_id: deviceId,
          internship_id: jobId,
          title: job.position || null,
          company: job.company || null,
          external_url: job.apply_link || job.source_url || null,
          source: 'tracked',
          status,
          status_history: JSON.stringify([{ status, at: status === 'saved' ? now : `${appliedAt}T00:00:00Z` }]),
          notes: optText(body?.notes)?.slice(0, 500) ?? null,
          applied_at: status === 'saved' ? null : appliedAt,
          created_at: now,
          updated_at: now,
        };
        await db.from('device_applications').insert(record).select('id');
        return json({ application: trackingRow(mapDeviceApplication(record), job) }, 201);
      }

      const trackingAction = path.match(/^\/api\/tracking\/([^/]+)$/);
      if (trackingAction) {
        const applicationId = idParam(trackingAction[1], '投递记录');
        const application = await loadDeviceApplication(db, applicationId);
        if (!application) fail(404, 'not_found', '投递记录不存在。');
        if (method === 'DELETE') {
          const deviceId = deviceIdParam(new URL(request.url).searchParams.get('deviceId'));
          if (application.device_id !== deviceId) fail(403, 'forbidden', '无权修改该投递记录。');
          await db.from('device_applications').delete().eq('id', applicationId);
          return json({ deleted: true });
        }
        if (method === 'PATCH') {
          const body = await parseBody(request);
          const deviceId = deviceIdParam(body?.deviceId);
          if (application.device_id !== deviceId) fail(403, 'forbidden', '无权修改该投递记录。');
          const status = String(body?.status || '');
          if (!APPLICATION_STATUS_ORDER.includes(status)) fail(400, 'invalid_input', '投递状态不合法。');
          if (!(ALLOWED_APPLICATION_TRANSITIONS[application.status] || []).includes(status)) {
            fail(400, 'invalid_transition', '当前状态不能直接切换到该进度。');
          }
          const now = isoSeconds(new Date());
          const history = [...application.status_history, { status, at: now }];
          const patch = {
            status,
            status_history: JSON.stringify(history),
            updated_at: now,
          };
          if (status === 'applied' && !application.applied_at) patch.applied_at = todayIso();
          if (body?.notes !== undefined) patch.notes = optText(body.notes)?.slice(0, 500) ?? null;
          await db.from('device_applications').update(patch).eq('id', applicationId).select('id');
          const updated = mapDeviceApplication({ ...application, ...patch, status_history: history });
          const job = isManualApplication(updated) ? null : await getInternshipById(db, updated.internship_id);
          return json({ application: applicationTrackingRow(updated, job) });
        }
        fail(405, 'method_not_allowed', '请求方法不支持。');
      }

      // 已废弃：仅保留兼容旧调用方，新代码统一走 /api/jobs 与 /api/tracking。
      if (path === '/api/board' && method === 'GET') {
        const includePending = new URL(request.url).searchParams.get('includePending') === '1';
        return deprecatedJson(await boardPayload(db, includePending, true));
      }

      if (path === '/api/meta' && method === 'GET') {
        return json(await metaPayload(db));
      }

      if (path === '/api/collect/refresh' && method === 'POST') {
        await requireAdmin(request);
        return json(await refreshOnOpen({ db, llm, fetcher }));
      }

      // 每日定时任务入口：同一天只抓取一次，其余调用仅继续解析队列。
      if (path === '/api/cron/collect' && method === 'POST') {
        let body = {};
        try { body = await parseBody(request); } catch { body = {}; }
        return json(await runDailyCollect({ db, llm, target: body?.target, fetcher }));
      }

      // 已废弃：仅保留兼容旧调用方，新代码统一走 /api/jobs。
      if (path === '/api/explore' && method === 'GET') {
        const params = new URL(request.url).searchParams;
        const directions = listParam(params.get('direction'));
        const industries = listParam(params.get('industry'));
        const locations = listParam(params.get('location'));
        const limit = Math.min(Math.max(Number(params.get('limit')) || 8, 1), 20);
        return deprecatedJson(await explorePayload(db, { directions, industries, locations, limit }));
      }

      if (path === '/api/sample-sets' || path.startsWith('/api/experiments')) {
        await requireAdmin(request);
      }

      if (path === '/api/sample-sets' && method === 'POST') {
        const body = await parseBody(request);
        const result = await importSampleSet(db, {
          filename: body?.filename,
          contentBase64: body?.contentBase64,
          name: optText(body?.name),
        });
        return json({
          sampleSet: {
            id: result.sampleSet.id,
            name: result.sampleSet.name,
            sourceType: result.sampleSet.source_type,
            count: result.sampleSet.samples.length,
            createdAt: result.sampleSet.created_at,
          },
          invalidRowNumbers: result.invalidRowNumbers,
        }, 201);
      }

      if (path === '/api/experiments' && method === 'POST') {
        const body = await parseBody(request);
        if (!body?.sampleSetId) fail(400, 'invalid_input', '请选择样本集。');
        const experiment = await createExperiment(db, {
          sampleSetId: body.sampleSetId,
          modelNames: body.modelNames,
          kind: body.kind,
          promptVersions: body.promptVersions,
          temperature: body.temperature,
          maxTokens: body.maxTokens,
        });
        const sampleSet = await getSampleSet(db, experiment.sample_set_id);
        return json({ experiment: publicExperiment(experiment, sampleSet) }, 201);
      }

      const experimentAction = path.match(/^\/api\/experiments\/([^/]+)\/(run-batch|abandon|report)$/);
      if (experimentAction) {
        const experimentId = idParam(experimentAction[1], '实验');
        const action = experimentAction[2];
        if (action === 'run-batch' && method === 'POST') {
          let body = {};
          if (request.headers.get('content-type')?.startsWith('application/json')) body = await parseBody(request);
          const budget = Math.min(Math.max(Number(body?.budget) || 4, 1), 8);
          return json(await runBatch({ db, llm, experimentId, budget }));
        }
        if (action === 'abandon' && method === 'POST') {
          return json(await abandonExperiment(db, experimentId));
        }
        if (action === 'report' && method === 'GET') {
          const markdown = await exportMarkdownReport(db, experimentId);
          const stamp = displayMoment().replace(/[-: ]/g, '').slice(0, 12);
          return json({ filename: `internradar_experiment_${stamp}.md`, markdown });
        }
      }

      const experimentDetailPath = path.match(/^\/api\/experiments\/([^/]+)$/);
      if (experimentDetailPath && method === 'GET') {
        return json(await experimentDetail(db, idParam(experimentDetailPath[1], '实验')));
      }

      if (!path.startsWith('/api/admin')) fail(404, 'not_found', '接口不存在。');
      await requireAdmin(request);

      if (path === '/api/admin/queue' && method === 'GET') {
        return json(await queueSnapshot(db));
      }

      if (path === '/api/admin/collect/status' && method === 'GET') {
        return json(await collectStatus({ db }));
      }

      if (path === '/api/admin/collect/list' && method === 'POST') {
        const body = await parseBody(request);
        const sourceId = sourceIdParam(body?.sourceId);
        const page = Math.min(Math.max(Number(body?.page) || 1, 1), 50);
        return json(await collectList({ db, sourceId, page, criteria: body?.criteria || {}, fetcher }));
      }

      if (path === '/api/admin/collect/run' && method === 'POST') {
        const body = await parseBody(request);
        const sourceIds = Array.isArray(body?.sourceIds)
          ? body.sourceIds.map((id) => sourceIdParam(id)).slice(0, 8) : [];
        const page = Math.min(Math.max(Number(body?.page) || 1, 1), 50);
        const target = Math.min(Math.max(Number(body?.target) || 0, 0), 300);
        return json(await collectRun({ db, sourceIds, criteria: body?.criteria || {}, page, target, dryRun: body?.dryRun === true, fetcher }));
      }

      if (path === '/api/admin/collect/sources/discover' && method === 'POST') {
        const body = await parseBody(request);
        return json(await discoverSource({ db, url: body?.url, name: body?.name, fetcher }));
      }

      if (path === '/api/admin/collect/sources/add' && method === 'POST') {
        const body = await parseBody(request);
        return json(await addSource({
          db, url: body?.url, name: body?.name, notes: body?.notes, category: body?.category,
        }), 201);
      }

      if (path === '/api/admin/collect/sources/remove' && method === 'POST') {
        const body = await parseBody(request);
        return json(await removeSource({ db, sourceId: sourceIdParam(body?.sourceId) }));
      }

      if (path === '/api/admin/collect/sources/toggle' && method === 'POST') {
        const body = await parseBody(request);
        return json(await setSourceEnabled({ db, sourceId: sourceIdParam(body?.sourceId), enabled: body?.enabled !== false }));
      }

      if (path === '/api/admin/collect/parse' && method === 'POST') {
        const body = await parseBody(request);
        const rawId = idParam(body?.rawId, '待解析内容');
        return json(await parseCollectedItem({ db, llm, rawId, fetcher }));
      }

      if (path === '/api/admin/collect/reparse' && method === 'POST') {
        let body = {};
        if (request.headers.get('content-type')?.startsWith('application/json')) body = await parseBody(request);
        const limit = Math.min(Math.max(Number(body?.limit) || 10, 1), 20);
        return json(await reparseQueue({ db, llm, limit, fetcher }));
      }

      if (path === '/api/admin/llm/test' && method === 'POST') {
        return json(await probeLlm(llm));
      }

      const internshipAction = path.match(/^\/api\/admin\/internships\/([^/]+)\/(confirm|discard|apply|expire)$/);
      if (internshipAction && method === 'POST') {
        const internshipId = idParam(internshipAction[1], '岗位');
        const action = internshipAction[2];
        if (action === 'confirm') {
          const body = await parseBody(request);
          return json(await confirmInternship(db, internshipId, body?.edits || {}));
        }
        if (action === 'discard') {
          await discardInternship(db, internshipId);
          return json({ ok: true });
        }
        if (action === 'apply') {
          const body = await parseBody(request);
          const applied = await createApplication(db, internshipId, {
            appliedAt: optText(body?.appliedAt), notes: body?.notes,
          });
          return json({ application: applied });
        }
        const expired = await markExpired(db, internshipId);
        return json({ application: expired });
      }

      const transition = path.match(/^\/api\/admin\/applications\/([^/]+)\/transition$/);
      if (transition && method === 'POST') {
        const applicationId = idParam(transition[1], '投递记录');
        const body = await parseBody(request);
        if (!body || typeof body.status !== 'string' || !(body.status in APPLICATION_STATUS_LABELS)) {
          fail(400, 'invalid_input', '投递状态不合法。');
        }
        return json(await transitionApplication(db, applicationId, body.status));
      }

      if (path === '/api/admin/backfill-directions' && method === 'POST') {
        const updated = await backfillDirections(db);
        return json({ updated });
      }

      if (path === '/api/admin/sample-sets/from-confirmed' && method === 'POST') {
        const body = await parseBody(request);
        const sampleSet = await exportConfirmedAsSampleSet(db, body?.internshipIds, optText(body?.name));
        return json({
          sampleSet: {
            id: sampleSet.id,
            name: sampleSet.name,
            sourceType: sampleSet.source_type,
            count: sampleSet.samples.length,
            createdAt: sampleSet.created_at,
          },
        }, 201);
      }

      if (path === '/api/admin/prompt/rollback' && method === 'POST') {
        const body = await parseBody(request);
        if (!body?.versionId) fail(400, 'invalid_input', '请选择要回滚的 prompt 版本。');
        const version = await rollbackPromptVersion(db, body.versionId);
        return json({ versionId: version.version_id, isActive: true });
      }

      if (path === '/api/admin/maintenance/classify' && method === 'POST') {
        const body = await parseBody(request);
        return json(await maintainClassification(db, {
          dryRun: body?.dryRun !== false,
          offset: Math.max(Number(body?.offset) || 0, 0),
          limit: Math.min(Math.max(Number(body?.limit) || 200, 1), 200),
          batchId: optText(body?.batchId),
        }));
      }

      if (path === '/api/admin/maintenance/rollback' && method === 'POST') {
        const body = await parseBody(request);
        const batchId = String(body?.batchId || '').trim();
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(batchId)) fail(400, 'invalid_input', '请提供要回滚的批次号。');
        return json(await rollbackMaintenance(db, {
          batchId,
          dryRun: body?.dryRun !== false,
          offset: Math.max(Number(body?.offset) || 0, 0),
          limit: Math.min(Math.max(Number(body?.limit) || 200, 1), 200),
        }));
      }

      if (path === '/api/admin/import' && method === 'POST') {
        const body = await parseBody(request);
        return json(await importSeed(db, body));
      }

      fail(404, 'not_found', '接口不存在。');
    } catch (error) {
      if (error?.expose && error?.status) {
        return json({ error: { code: error.code || 'request_failed', message: error.message } }, error.status);
      }
      if (error?.code) {
        console.error(`database_error code=${String(error.code)} request_id=${String(ctx?.requestId ?? '')}`);
        return json({ error: { code: 'database_unavailable', message: '数据库暂时不可用，请稍后重试。' } }, 503);
      }
      if (['TypeError', 'ReferenceError', 'RangeError', 'SyntaxError'].includes(error?.name)) {
        return json({ error: { code: 'internal_error', message: '服务器处理失败，请稍后重试。' } }, 500);
      }
      return json({
        error: { code: 'request_failed', message: error?.message || '请求处理失败，请稍后重试。' },
      }, error?.status && error.status < 500 ? error.status : 400);
    }
  };
}
