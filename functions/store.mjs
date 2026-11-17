import {
  BASE_PROMPT_V1, COLLECT_CITIES, COMPANY_NATURE_VALUES, DEADLINE_PROXIMITY_VALUES,
  DIRECTION_GROUPS, DIRECTIONS, INDUSTRIES, MAJOR_GROUPS,
  NULL_RATE_TRIGGER, ACCURACY_TRIGGER, RELIABLE_LABEL_FIELDS, APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_ORDER, ALLOWED_APPLICATION_TRANSITIONS, toBool, isoSeconds, canonicalSourceName,
  cleanPositionTitle, refineCityFromTitle, classifyDirection,
} from './core.mjs';

// 平台单次查询最多返回 1000 行，超限的 limit 会直接失败。
export const DB_MAX_ROWS = 1000;

export function dbRows(result) {
  if (result && result.error) {
    const error = new Error(result.error.code || 'database_unavailable');
    error.code = result.error.code || 'database_unavailable';
    throw error;
  }
  return result?.data || [];
}

export function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function mapInternship(row) {
  const additionalSources = parseJson(row.additional_sources, []);
  const position = row.position_title ?? row.position ?? '';
  return {
    id: row.id,
    company: row.company || '',
    position: cleanPositionTitle(position),
    location: refineCityFromTitle(row.location ?? null, position, row.company),
    position_type: row.position_type ?? null,
    is_intern: toBool(row.is_intern),
    major_requirements: row.major_requirements ?? null,
    apply_link: row.apply_link ?? null,
    deadline: row.deadline ?? null,
    deadline_raw: row.deadline_raw ?? null,
    pay: row.pay ?? null,
    published_at: row.published_at ?? null,
    source_url: row.source_url || '',
    source_name: canonicalSourceName(row.source_name),
    confidence: Number(row.confidence ?? 0),
    source_model: row.source_model || '',
    source_prompt_version: row.source_prompt_version || '',
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // 早期入库时规则未覆盖到的岗位，展示时用最新关键词补一次方向，避免卡片只有企业性质标签。
    // 只按岗位标题补方向，不用公司名推断，避免「制造公司储备干部」被硬填成生产制造。
    direction: row.direction || classifyDirection(position).value,
    industry: row.industry ?? null,
    industry_source: row.industry_source ?? null,
    company_nature: row.company_nature ?? null,
    raw_content_id: row.raw_content_id ?? null,
    additional_sources: (Array.isArray(additionalSources) ? additionalSources : []).map(canonicalSourceName),
    edited_fields: parseJson(row.edited_fields, []),
    parse_failed_fields: parseJson(row.parse_failed_fields, []),
  };
}

export function mapApplication(row) {
  if (!row) return null;
  const history = parseJson(row.status_history, []);
  return {
    id: row.id,
    internship_id: row.internship_id,
    applied_at: row.applied_at,
    notes: row.notes ?? null,
    status: row.status,
    status_history: Array.isArray(history) && history.length
      ? history
      : [{ status: row.status, at: row.updated_at || row.applied_at }],
    updated_at: row.updated_at,
  };
}

export function mapDeviceApplication(row) {
  if (!row) return null;
  const history = parseJson(row.status_history, []);
  return {
    id: row.id,
    device_id: row.device_id,
    internship_id: row.internship_id,
    title: row.title ?? null,
    company: row.company ?? null,
    external_url: row.external_url ?? null,
    source: row.source === 'manual' || String(row.internship_id || '').startsWith('manual:')
      ? 'manual' : 'tracked',
    status: row.status,
    status_history: Array.isArray(history) && history.length
      ? history
      : [{ status: row.status, at: row.updated_at || row.created_at }],
    notes: row.notes ?? null,
    applied_at: row.applied_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function loadDeviceApplications(db, deviceId) {
  const rows = dbRows(await db.from('device_applications').select('*').eq('device_id', deviceId));
  return rows.map(mapDeviceApplication);
}

export async function loadDeviceApplication(db, id) {
  const rows = dbRows(await db.from('device_applications').select('*').eq('id', id).limit(1));
  return mapDeviceApplication(rows[0]);
}

export function mapPromptVersion(row) {
  const fewShot = parseJson(row.few_shot_samples, []);
  return {
    version_id: row.version_id,
    base_prompt: row.base_prompt,
    few_shot_samples: Array.isArray(fewShot) ? fewShot : [],
    trigger_reason: row.trigger_reason,
    accuracy_improvement: row.accuracy_improvement === null || row.accuracy_improvement === undefined
      ? null : Number(row.accuracy_improvement),
    created_at: row.created_at,
    is_active: toBool(row.is_active),
  };
}

export function mapSampleSet(row) {
  const samples = parseJson(row.samples, []);
  return {
    id: row.id,
    name: row.name,
    source_type: row.source_type,
    samples: Array.isArray(samples) ? samples : [],
    created_at: row.created_at,
  };
}

export function mapExperiment(row) {
  return {
    id: row.id,
    sample_set_id: row.sample_set_id,
    kind: row.kind,
    config: parseJson(row.config, {}),
    status: row.status,
    note: row.note ?? null,
    created_at: row.created_at,
    finished_at: row.finished_at ?? null,
  };
}

export function mapResult(row) {
  const runConfig = parseJson(row.run_config, {});
  return {
    id: row.id,
    experiment_id: row.experiment_id,
    sample_set_id: row.sample_set_id,
    model_name: row.model_name,
    run_config: {
      prompt_version: runConfig.prompt_version || '',
      temperature: Number(runConfig.temperature ?? 0),
      max_tokens: Number(runConfig.max_tokens ?? 2048),
    },
    run_status: row.run_status,
    per_field_accuracy: parseJson(row.per_field_accuracy, {}),
    overall_accuracy: Number(row.overall_accuracy ?? 0),
    overall_recall: Number(row.overall_recall ?? 0),
    null_rate_by_field: parseJson(row.null_rate_by_field, {}),
    error_cases: parseJson(row.error_cases, []),
    run_duration_ms: Number(row.run_duration_ms ?? 0),
    token_cost: row.token_cost === null || row.token_cost === undefined ? null : Number(row.token_cost),
    created_at: row.created_at,
  };
}

export async function loadInternships(db, limit = DB_MAX_ROWS) {
  return dbRows(await db.from('internships').select('*').order('created_at', { ascending: false }).limit(limit))
    .map(mapInternship);
}

// 列表查询需要完整结果时按 1000 行翻页；平台或本地 mock 不支持 range 时退回单页。
export async function loadInternshipsAll(db, {
  isIntern, positionType, company, maxRows = DB_MAX_ROWS * 8,
} = {}) {
  const makeQuery = () => {
    let query = db.from('internships').select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (isIntern === true || isIntern === false) query = query.eq('is_intern', isIntern ? 1 : 0);
    if (positionType) query = query.eq('position_type', positionType);
    if (company) query = query.eq('company', company);
    return query;
  };
  const probe = makeQuery();
  if (typeof probe?.range !== 'function') {
    const rows = dbRows(await probe.limit(DB_MAX_ROWS));
    return { rows: rows.map(mapInternship), truncated: rows.length >= DB_MAX_ROWS };
  }
  const rows = [];
  let offset = 0;
  while (offset < maxRows) {
    const page = dbRows(await makeQuery().range(offset, offset + DB_MAX_ROWS - 1));
    rows.push(...page);
    if (page.length < DB_MAX_ROWS) {
      return { rows: rows.map(mapInternship), truncated: false };
    }
    offset += DB_MAX_ROWS;
  }
  return { rows: rows.map(mapInternship), truncated: true };
}

// 维护任务按页读取；优先用 range，平台或本地 mock 不支持时退回单次 1000 行切片。
export async function loadInternshipsPage(db, offset = 0, limit = DB_MAX_ROWS) {
  const makeQuery = () => db.from('internships').select('*')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  const query = makeQuery();
  if (typeof query?.range === 'function') {
    return dbRows(await query.range(offset, offset + limit - 1)).map(mapInternship);
  }
  const rows = dbRows(await makeQuery().limit(DB_MAX_ROWS)).map(mapInternship);
  return rows.slice(offset, offset + limit);
}

export async function getInternshipById(db, id) {
  const rows = dbRows(await db.from('internships').select('*').eq('id', id).limit(1));
  return rows[0] ? mapInternship(rows[0]) : null;
}

export async function loadApplications(db, limit = DB_MAX_ROWS) {
  const rows = dbRows(await db.from('applications').select('*').limit(limit));
  const map = new Map();
  for (const row of rows) map.set(row.internship_id, mapApplication(row));
  return map;
}

export async function loadRawContents(db, limit = DB_MAX_ROWS) {
  const rows = dbRows(await db.from('raw_contents').select('*').limit(limit));
  const map = new Map();
  for (const row of rows) map.set(row.id, row);
  return map;
}

export async function loadModelLabels(db) {
  const rows = dbRows(
    await db.from('experiment_results')
      .select('model_name,per_field_accuracy,null_rate_by_field,created_at')
      .eq('run_status', 'completed')
      .order('created_at', { ascending: false })
      .limit(DB_MAX_ROWS),
  );
  const labels = new Map();
  for (const row of rows) {
    if (labels.has(row.model_name)) continue;
    const accuracy = parseJson(row.per_field_accuracy, {});
    const nullRate = parseJson(row.null_rate_by_field, {});
    const triggered = {};
    for (const field of RELIABLE_LABEL_FIELDS) {
      const fieldAccuracy = Number(accuracy[field] ?? 1);
      const fieldNullRate = Number(nullRate[field] ?? 0);
      if (fieldNullRate > NULL_RATE_TRIGGER || fieldAccuracy < ACCURACY_TRIGGER) {
        triggered[field] = { accuracy: fieldAccuracy, nullRate: fieldNullRate };
      }
    }
    labels.set(row.model_name, triggered);
  }
  return labels;
}

export function buildBoardMeta(internships) {
  const locations = [...new Set(
    internships
      .filter((item) => item.status !== 'discarded' && item.location)
      .map((item) => item.location),
  )].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const industries = [...new Set(
    internships
      .filter((item) => item.status !== 'discarded' && item.industry)
      .map((item) => item.industry),
  )].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  return {
    directions: [...DIRECTIONS],
    directionGroups: DIRECTION_GROUPS.map((entry) => ({ group: entry.group, items: [...entry.items] })),
    majorGroups: MAJOR_GROUPS.map((entry) => ({
      group: entry.group,
      majors: entry.majors.map(([name]) => name),
    })),
    industries: [...new Set([...INDUSTRIES, ...industries])],
    locations,
    companyNatures: [...COMPANY_NATURE_VALUES],
    deadlineBuckets: [...DEADLINE_PROXIMITY_VALUES],
    applyStatusLabels: APPLICATION_STATUS_ORDER.map((key) => APPLICATION_STATUS_LABELS[key]),
    pageSize: 50,
    labelFields: [...RELIABLE_LABEL_FIELDS],
  };
}

export function boardRow(item, application, labels) {
  const statusKey = application ? application.status : 'to_apply';
  return {
    id: item.id,
    company: item.company,
    position: item.position,
    location: item.location,
    positionType: item.position_type,
    isIntern: item.is_intern,
    majorRequirements: item.major_requirements,
    applyLink: item.apply_link,
    deadline: item.deadline,
    deadlineRaw: item.deadline_raw,
    pay: item.pay,
    publishedAt: item.published_at,
    sourceName: item.source_name,
    sourceUrl: item.source_url,
    sourceModel: item.source_model,
    additionalSources: item.additional_sources.length,
    confidence: item.confidence,
    status: item.status,
    direction: item.direction,
    industry: item.industry,
    companyNature: item.company_nature,
    applyStatus: APPLICATION_STATUS_LABELS[statusKey] || APPLICATION_STATUS_LABELS.to_apply,
    applyStatusKey: statusKey,
    appliedAt: application ? application.applied_at : null,
    notes: application ? application.notes : null,
    applicationId: application ? application.id : null,
    statusHistory: application ? application.status_history : [],
    updatedAt: application ? application.updated_at : null,
    createdAt: item.created_at,
    allowedTransitions: (ALLOWED_APPLICATION_TRANSITIONS[statusKey] || []).map((key) => ({
      key,
      label: APPLICATION_STATUS_LABELS[key],
    })),
    labels: labels.get(item.source_model) || {},
    rawContentId: item.raw_content_id,
    editedFields: item.edited_fields,
  };
}

export function serializeInternshipPatch(fields) {
  const patch = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'is_intern') patch.is_intern = value ? 1 : 0;
    else if (key === 'additional_sources' || key === 'edited_fields') patch[key] = JSON.stringify(value);
    else patch[key] = value;
  }
  return patch;
}

export async function getActivePromptVersion(db) {
  const rows = dbRows(
    await db.from('prompt_versions')
      .select('*')
      .eq('is_active', 1)
      .order('created_at', { ascending: false })
      .limit(1),
  );
  if (rows.length) return mapPromptVersion(rows[0]);
  const seedId = 'prod_fewshot_v1';
  const version = {
    version_id: seedId,
    base_prompt: BASE_PROMPT_V1,
    few_shot_samples: [],
    trigger_reason: 'manual_edit',
    accuracy_improvement: null,
    created_at: isoSeconds(new Date()),
    is_active: true,
  };
  dbRows(await db.from('prompt_versions').insert({
    version_id: version.version_id,
    base_prompt: version.base_prompt,
    few_shot_samples: '[]',
    trigger_reason: version.trigger_reason,
    accuracy_improvement: null,
    created_at: version.created_at,
    is_active: 1,
  }).select('version_id'));
  return version;
}

export async function listPromptVersions(db) {
  const rows = dbRows(
    await db.from('prompt_versions').select('*').order('created_at', { ascending: false }).limit(50),
  );
  return rows.map(mapPromptVersion).sort((a, b) => {
    if (a.created_at === b.created_at) return b.version_id.localeCompare(a.version_id);
    return a.created_at < b.created_at ? 1 : -1;
  });
}

export async function getPromptVersion(db, versionId) {
  const active = await getActivePromptVersion(db);
  if (!versionId || versionId === active.version_id) return active;
  const rows = dbRows(await db.from('prompt_versions').select('*').eq('version_id', versionId).limit(1));
  return rows.length ? mapPromptVersion(rows[0]) : active;
}

export async function listSampleSets(db) {
  const rows = dbRows(
    await db.from('sample_sets').select('*').order('created_at', { ascending: false }).limit(200),
  );
  return rows.map(mapSampleSet);
}

export async function getSampleSet(db, id) {
  const rows = dbRows(await db.from('sample_sets').select('*').eq('id', id).limit(1));
  return rows.length ? mapSampleSet(rows[0]) : null;
}

export async function listExperiments(db, limit = 50) {
  const rows = dbRows(
    await db.from('experiments').select('*').order('created_at', { ascending: false }).limit(limit),
  );
  return rows.map(mapExperiment);
}

export async function getExperiment(db, id) {
  const rows = dbRows(await db.from('experiments').select('*').eq('id', id).limit(1));
  return rows.length ? mapExperiment(rows[0]) : null;
}

export async function listResults(db, experimentId) {
  const rows = dbRows(
    await db.from('experiment_results')
      .select('*')
      .eq('experiment_id', experimentId)
      .order('created_at', { ascending: true })
      .limit(200),
  );
  return rows.map(mapResult);
}

export async function saveExperimentPatch(db, id, patch) {
  return dbRows(
    await db.from('experiments').update(patch).eq('id', id).select('id'),
  );
}

export async function averageSecondsPerSample(db) {
  const results = dbRows(
    await db.from('experiment_results')
      .select('run_duration_ms,sample_set_id,created_at')
      .eq('run_status', 'completed')
      .order('created_at', { ascending: false })
      .limit(5),
  );
  const sets = await listSampleSets(db);
  const counts = new Map(sets.map((set) => [set.id, set.samples.length]));
  const values = [];
  for (const row of results) {
    const count = counts.get(row.sample_set_id) || 0;
    if (count) values.push(Number(row.run_duration_ms || 0) / 1000 / count);
  }
  if (!values.length) return 3.0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// 列表解析兜底每天最多 100 次；与实验共用 300 次站点额度。
export const COLLECT_LLM_DAILY_LIMIT = 100;

export function collectLlmDailyLimit() {
  const raw = Number(globalThis.Deno?.env?.get?.('INTERNRADAR_COLLECT_LLM_DAILY_LIMIT'));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : COLLECT_LLM_DAILY_LIMIT;
}

export function usageDay(date = new Date()) {
  return isoSeconds(date).slice(0, 10);
}

export async function collectLlmCallsToday(db, day = usageDay()) {
  const rows = dbRows(await db.from('llm_usage').select('*').eq('day', day).limit(1));
  return Number(rows[0]?.calls || 0);
}

// 先占额度再调用，避免失败重试把当天预算透支。
export async function claimCollectLlmCall(db, limit = collectLlmDailyLimit()) {
  const day = usageDay();
  const rows = dbRows(await db.from('llm_usage').select('*').eq('day', day).limit(1));
  const used = Number(rows[0]?.calls || 0);
  if (used >= limit) return false;
  const now = isoSeconds(new Date());
  if (rows.length) {
    await db.from('llm_usage').update({ calls: used + 1, updated_at: now }).eq('day', day).select('day');
    return true;
  }
  try {
    await db.from('llm_usage').insert({ day, calls: 1, updated_at: now }).select('day');
    return true;
  } catch {
    // 并发下另一请求已插入当天记录，改为自增已有记录。
    const latest = dbRows(await db.from('llm_usage').select('*').eq('day', day).limit(1));
    const current = Number(latest[0]?.calls || 0);
    if (current >= limit) return false;
    await db.from('llm_usage').update({ calls: current + 1, updated_at: now }).eq('day', day).select('day');
    return true;
  }
}

