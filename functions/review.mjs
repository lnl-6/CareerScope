import {
  EDITABLE_FIELDS, ALLOWED_APPLICATION_TRANSITIONS, APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_ORDER, isoSeconds, uuid, todayIso, optText,
  classifyJob,
} from './core.mjs';
import {
  DB_MAX_ROWS, dbRows, loadInternships, loadInternshipsPage, loadRawContents, loadApplications, mapApplication,
} from './store.mjs';
import { maybeEvolvePrompt } from './experiments.mjs';

const COLUMN_OF = {
  company: 'company',
  position: 'position_title',
  location: 'location',
  position_type: 'position_type',
  is_intern: 'is_intern',
  major_requirements: 'major_requirements',
  apply_link: 'apply_link',
  deadline: 'deadline',
  deadline_raw: 'deadline_raw',
  direction: 'direction',
  industry: 'industry',
  industry_source: 'industry_source',
};

function itemValue(item, field) {
  return item[field];
}

function applyEdits(item, edits) {
  const updates = {};
  const changed = [];
  for (const [key, rawValue] of Object.entries(edits || {})) {
    if (!EDITABLE_FIELDS.includes(key)) continue;
    let value = rawValue;
    if (key === 'is_intern') value = Boolean(value);
    else if (value === '') value = null;
    if (itemValue(item, key) !== value) {
      updates[COLUMN_OF[key]] = key === 'is_intern' ? (value ? 1 : 0) : value;
      changed.push(key);
    }
  }
  return { updates, changed };
}

export async function listPending(db) {
  const internships = await loadInternships(db);
  const rawContents = await loadRawContents(db);
  const pending = internships
    .filter((item) => item.status === 'pending_review')
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.confidence - b.confidence);
  return pending.map((item) => {
    const raw = item.raw_content_id ? rawContents.get(item.raw_content_id) : null;
    return {
      ...reviewRow(item),
      rawText: raw ? String(raw.raw_text || '').slice(0, 4000) : '',
    };
  });
}

function reviewRow(item) {
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
    direction: item.direction,
    industry: item.industry,
    industrySource: item.industry_source,
    companyNature: item.company_nature,
    confidence: item.confidence,
    sourceName: item.source_name,
    sourceUrl: item.source_url,
    sourceModel: item.source_model,
    status: item.status,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    editedFields: item.edited_fields,
    rawContentId: item.raw_content_id,
  };
}

export async function queueSnapshot(db) {
  const internships = await loadInternships(db);
  const counts = { pending_review: 0, confirmed: 0, discarded: 0 };
  for (const item of internships) {
    if (item.status in counts) counts[item.status] += 1;
  }
  const applications = await loadApplications(db);
  const rawContents = await loadRawContents(db);
  const pending = internships
    .filter((item) => item.status === 'pending_review')
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.confidence - b.confidence)
    .map((item) => {
      const raw = item.raw_content_id ? rawContents.get(item.raw_content_id) : null;
      return { ...reviewRow(item), rawText: raw ? String(raw.raw_text || '').slice(0, 4000) : '' };
    });
  const confirmed = internships
    .filter((item) => item.status === 'confirmed')
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    .map((item) => {
      const application = applications.get(item.id);
      const raw = item.raw_content_id ? rawContents.get(item.raw_content_id) : null;
      return {
        ...reviewRow(item),
        hasRawText: Boolean(raw?.raw_text),
        applyStatus: application ? APPLICATION_STATUS_LABELS[application.status] : null,
        applyStatusKey: application ? application.status : 'to_apply',
        appliedAt: application ? application.applied_at : null,
        applicationId: application ? application.id : null,
        allowedTransitions: ((ALLOWED_APPLICATION_TRANSITIONS[application ? application.status : 'to_apply'] || []))
          .map((key) => ({ key, label: APPLICATION_STATUS_LABELS[key] })),
      };
    });
  return {
    counts: {
      pending: counts.pending_review,
      confirmed: counts.confirmed,
      discarded: counts.discarded,
    },
    missingDirection: internships.filter((item) => item.direction === null).length,
    pending,
    confirmed,
    applyStatusLabels: APPLICATION_STATUS_ORDER.map((key) => APPLICATION_STATUS_LABELS[key]),
  };
}

export async function confirmInternship(db, internshipId, edits) {
  const internships = await loadInternships(db);
  const item = internships.find((entry) => entry.id === internshipId);
  if (!item) {
    const error = new Error(`岗位记录不存在：${internshipId}`);
    error.status = 404;
    throw error;
  }
  const { updates, changed } = applyEdits(item, edits);
  const editedFields = [...new Set([...item.edited_fields, ...changed])];
  const patch = {
    ...updates,
    status: 'confirmed',
    edited_fields: JSON.stringify(editedFields),
    updated_at: isoSeconds(new Date()),
  };
  dbRows(await db.from('internships').update(patch).eq('id', internshipId).select('id'));
  let evolved = null;
  try {
    const version = await maybeEvolvePrompt(db); // 4.2.6：确认积累触发自动演进
    if (version) evolved = version.version_id;
  } catch {
    // 演进失败不影响确认结果
  }
  return {
    item: { ...reviewRow({ ...item, ...updates, ...mapEditsBack(updates) }), status: 'confirmed', editedFields },
    evolved,
  };
}

function mapEditsBack(updates) {
  const mapped = {};
  for (const [field, key] of Object.entries(COLUMN_OF)) {
    if (key in updates) mapped[field] = field === 'is_intern' ? Boolean(updates[key]) : updates[key];
  }
  return mapped;
}

export async function discardInternship(db, internshipId) {
  dbRows(await db.from('internships')
    .update({ status: 'discarded', updated_at: isoSeconds(new Date()) })
    .eq('id', internshipId)
    .select('id'));
}

export async function backfillDirections(db) {
  const result = await maintainClassification(db, { dryRun: false, offset: 0, limit: DB_MAX_ROWS });
  return result.updated;
}

export async function createApplication(db, internshipId, { appliedAt, notes } = {}) {
  const existing = mapApplication(
    dbRows(await db.from('applications').select('*').eq('internship_id', internshipId).limit(1))[0],
  );
  if (existing) throw new Error('该岗位已有投递记录，一次投递后不可重复标记');
  const now = isoSeconds(new Date());
  const application = {
    id: uuid(),
    internship_id: internshipId,
    applied_at: appliedAt || todayIso(),
    notes: optText(notes),
    status: 'applied',
    status_history: [{ status: 'applied', at: now }],
    updated_at: now,
  };
  dbRows(await db.from('applications').insert({
    id: application.id,
    internship_id: application.internship_id,
    applied_at: application.applied_at,
    notes: application.notes,
    status: application.status,
    status_history: JSON.stringify(application.status_history),
    updated_at: application.updated_at,
  }).select('id'));
  return application;
}

export async function transitionApplication(db, applicationId, newStatus) {
  const row = dbRows(await db.from('applications').select('*').eq('id', applicationId).limit(1))[0];
  if (!row) {
    const error = new Error(`投递记录不存在：${applicationId}`);
    error.status = 404;
    throw error;
  }
  const current = mapApplication(row);
  if (newStatus === current.status) return current;
  if (!(ALLOWED_APPLICATION_TRANSITIONS[current.status] || []).includes(newStatus)) {
    throw new Error(`不允许从「${current.status}」流转到「${newStatus}」`);
  }
  const updatedAt = isoSeconds(new Date());
  const statusHistory = [...(current.status_history || []), { status: newStatus, at: updatedAt }];
  dbRows(await db.from('applications')
    .update({ status: newStatus, status_history: JSON.stringify(statusHistory), updated_at: updatedAt })
    .eq('id', applicationId)
    .select('id'));
  return { ...current, status: newStatus, status_history: statusHistory, updated_at: updatedAt };
}

export async function markExpired(db, internshipId) {
  const row = dbRows(await db.from('applications').select('*').eq('internship_id', internshipId).limit(1))[0];
  if (row) return transitionApplication(db, row.id, 'expired');
  const now = isoSeconds(new Date());
  const application = {
    id: uuid(),
    internship_id: internshipId,
    applied_at: todayIso(),
    notes: null,
    status: 'expired',
    status_history: [{ status: 'expired', at: now }],
    updated_at: now,
  };
  dbRows(await db.from('applications').insert({
    id: application.id,
    internship_id: application.internship_id,
    applied_at: application.applied_at,
    notes: null,
    status: application.status,
    status_history: JSON.stringify(application.status_history),
    updated_at: application.updated_at,
  }).select('id'));
  return application;
}

const INTERNSHIP_COLUMNS = [
  'id', 'company', 'position_title', 'location', 'position_type', 'is_intern',
  'major_requirements', 'apply_link', 'deadline', 'deadline_raw', 'source_url', 'source_name',
  'confidence', 'source_model', 'source_prompt_version', 'status', 'created_at', 'updated_at',
  'direction', 'industry', 'industry_source', 'company_nature', 'pay', 'published_at',
  'raw_content_id', 'additional_sources', 'edited_fields',
];
const APPLICATION_COLUMNS = ['id', 'internship_id', 'applied_at', 'notes', 'status', 'status_history', 'updated_at'];
const RAW_COLUMNS = ['id', 'file_path', 'source_name', 'source_url', 'crawled_at', 'parse_status', 'error_message', 'raw_text'];

function pickColumns(source, columns) {
  const picked = {};
  for (const column of columns) {
    if (!(column in source)) continue;
    let value = source[column];
    if (column === 'position_title' && value === undefined && 'position' in source) value = source.position;
    if (column === 'is_intern' && typeof value === 'boolean') value = value ? 1 : 0;
    if (value && typeof value === 'object') value = JSON.stringify(value);
    picked[column] = value;
  }
  return picked;
}

export async function importSeed(db, payload) {
  const internships = Array.isArray(payload?.internships) ? payload.internships : [];
  const applications = Array.isArray(payload?.applications) ? payload.applications : [];
  const rawContents = Array.isArray(payload?.rawContents) ? payload.rawContents : [];
  const counts = { internships: 0, applications: 0, rawContents: 0 };
  for (const raw of rawContents) {
    const row = pickColumns(raw, RAW_COLUMNS);
    if (!row.id) continue;
    if (row.raw_text && row.raw_text.length > 200000) row.raw_text = row.raw_text.slice(0, 200000);
    await db.from('raw_contents').insertIfAbsent(row, { onConflict: 'id' }).select('id');
    counts.rawContents += 1;
  }
  for (const raw of internships) {
    const row = pickColumns(raw, INTERNSHIP_COLUMNS);
    if (!row.id) continue;
    // 入库唯一分类入口：客户端传来的 direction/industry 不可信，服务端重新判定。
    if (row.status !== 'discarded') {
      const classification = classifyJob({
        company: row.company,
        position: row.position_title,
        majorRequirements: row.major_requirements,
        positionType: row.position_type,
        sourceIndustry: row.industry_source === 'source' ? row.industry : null,
        location: row.location,
        applyLink: row.apply_link,
        sourceUrl: row.source_url,
      });
      row.position_type = classification.position_type;
      row.is_intern = classification.is_intern;
      row.direction = classification.direction;
      row.industry = classification.industry;
      row.industry_source = classification.industry_source;
    }
    await db.from('internships').insertIfAbsent(row, { onConflict: 'id' }).select('id');
    counts.internships += 1;
  }
  for (const raw of applications) {
    const row = pickColumns(raw, APPLICATION_COLUMNS);
    if (!row.id || !row.internship_id) continue;
    await db.from('applications').insertIfAbsent(row, { onConflict: 'id' }).select('id');
    counts.applications += 1;
  }
  return counts;
}

const MAINTENANCE_COLUMNS = [
  'position_type', 'is_intern', 'direction', 'industry', 'industry_source', 'location', 'apply_link',
];

function maintenancePatch(item) {
  const edited = new Set(item.edited_fields || []);
  const classification = classifyJob({
    company: item.company,
    position: item.position,
    majorRequirements: item.major_requirements,
    positionType: item.position_type,
    sourceIndustry: item.industry_source === 'source' ? item.industry : null,
    location: item.location,
    applyLink: item.apply_link,
    sourceUrl: item.source_url,
  });
  const patch = {};
  if (!edited.has('position_type') && item.position_type !== classification.position_type) {
    patch.position_type = classification.position_type;
  }
  const finalType = patch.position_type ?? item.position_type;
  const finalIntern = finalType === '实习';
  if (Boolean(item.is_intern) !== finalIntern) patch.is_intern = finalIntern ? 1 : 0;
  if (!edited.has('direction') && item.direction !== classification.direction) {
    patch.direction = classification.direction;
  }
  if (!edited.has('industry') && item.industry !== classification.industry) {
    patch.industry = classification.industry;
  }
  if (!edited.has('industry') && (item.industry_source ?? null) !== classification.industry_source) {
    patch.industry_source = classification.industry_source;
  }
  return patch;
}

function maintenanceSample(item, patch) {
  const before = {};
  const after = {};
  for (const [key, value] of Object.entries(patch)) {
    before[key] = item[key];
    after[key] = value;
  }
  return {
    id: item.id,
    company: item.company,
    position: item.position,
    before,
    after,
  };
}

export async function maintainClassification(db, {
  dryRun = true, offset = 0, limit = 200, batchId = null,
} = {}) {
  const rows = await loadInternshipsPage(db, offset, limit);
  const now = isoSeconds(new Date());
  const activeBatchId = dryRun ? batchId : (batchId || uuid());
  let affected = 0;
  let scanned = 0;
  const samples = [];
  for (const item of rows) {
    scanned += 1;
    if (item.status === 'discarded') continue;
    const patch = maintenancePatch(item);
    if (!Object.keys(patch).length) continue;
    affected += 1;
    if (samples.length < 10) samples.push(maintenanceSample(item, patch));
    if (dryRun) continue;
    const backup = {
      id: `${activeBatchId}:${item.id}`,
      batch_id: activeBatchId,
      internship_id: item.id,
      company: item.company,
      position_title: item.position,
      position_type: item.position_type,
      is_intern: item.is_intern ? 1 : 0,
      direction: item.direction,
      industry: item.industry,
      industry_source: item.industry_source,
      location: item.location,
      apply_link: item.apply_link,
      created_at: now,
    };
    await db.from('jobs_backup').insertIfAbsent(backup, { onConflict: 'id' }).select('id');
    dbRows(await db.from('internships')
      .update({ ...patch, updated_at: now })
      .eq('id', item.id)
      .select('id'));
  }
  return {
    batchId: activeBatchId,
    dryRun,
    scanned,
    affected,
    updated: dryRun ? 0 : affected,
    offset,
    limit,
    nextOffset: offset + rows.length,
    hasMore: rows.length === limit,
    samples,
  };
}

export async function rollbackMaintenance(db, {
  batchId, dryRun = true, offset = 0, limit = 200,
} = {}) {
  const makeQuery = () => db.from('jobs_backup')
    .select('*')
    .eq('batch_id', batchId)
    .order('id', { ascending: true });
  const query = makeQuery();
  const rows = typeof query?.range === 'function'
    ? dbRows(await query.range(offset, offset + limit - 1))
    : dbRows(await makeQuery().limit(DB_MAX_ROWS)).slice(offset, offset + limit);
  const now = isoSeconds(new Date());
  const samples = [];
  let updated = 0;
  for (const row of rows) {
    const restore = {};
    for (const field of MAINTENANCE_COLUMNS) {
      if (row[field] !== undefined) restore[field] = row[field];
    }
    if (samples.length < 10) {
      samples.push({
        internshipId: row.internship_id,
        company: row.company,
        position: row.position_title,
        restore,
      });
    }
    if (dryRun) continue;
    dbRows(await db.from('internships')
      .update({ ...restore, updated_at: now })
      .eq('id', row.internship_id)
      .select('id'));
    updated += 1;
  }
  return {
    batchId,
    dryRun,
    scanned: rows.length,
    updated,
    offset,
    limit,
    nextOffset: offset + rows.length,
    hasMore: rows.length === limit,
    samples,
  };
}
