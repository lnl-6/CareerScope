import {
  EVAL_FIELDS, ERROR_FIELD_PRIORITY, SAMPLE_SET_MIN_SIZE, SAMPLE_SET_MAX_SIZE, ERROR_CASE_MAX,
  FEWSHOT_MIN_COUNT, FEWSHOT_MAX_COUNT, FEWSHOT_MIN_AGE_HOURS, PROMPT_VERSION_KEEP,
  KIND_MODEL_COMPARISON, KIND_PROMPT_COMPARISON, NOTE_ABANDONED, EXPERIMENT_MODELS, EXPERIMENT_DEFAULTS,
  PUBLIC_SITE_MAX_SAMPLES, PUBLIC_SITE_MAX_MODELS,
  publicSiteDailyLimit, LlmError,
  buildProductionPrompt, preprocess, validateLlmOutput, isQuotaError, normalizeField,
  displayValue, classifyError, formatPercent, inferDirection, optText, parseBoolLike,
  isoSeconds, uuid, displayMoment, nextVersionId, toBool,
} from './core.mjs';
import {
  dbRows, getActivePromptVersion, getExperiment, getSampleSet, getPromptVersion, listResults,
  listSampleSets, listExperiments, listPromptVersions, loadInternships, loadRawContents,
  mapExperiment, saveExperimentPatch, parseJson, collectLlmCallsToday,
} from './store.mjs';

const CSV_GOLD_FIELDS = EVAL_FIELDS.filter((field) => field !== 'is_intern').concat('confidence');

function decodeBase64(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodeText(bytes) {
  for (const encoding of ['utf-8', 'gbk']) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(bytes);
    } catch {
      continue;
    }
  }
  throw new Error('样本集文件编码无法识别，请使用 UTF-8 或 GBK 保存');
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseJsonSamples(payload) {
  const items = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.samples : payload;
  if (!Array.isArray(items)) throw new Error('JSON 样本集需为 {"samples": [...]} 结构或样本数组');
  return items.map((item) => {
    if (!item || typeof item !== 'object') return { raw_text: '', gold_labels: {}, source_internship_id: null };
    return {
      raw_text: String(item.raw_text || ''),
      gold_labels: item.gold_labels && typeof item.gold_labels === 'object' ? item.gold_labels : {},
      source_internship_id: optText(item.source_internship_id),
    };
  });
}

function parseCsvSamples(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) throw new Error('CSV 样本集需包含 raw_text 列及目标字段列（company / position 等）');
  const headers = rows[0].map((name) => String(name || '').trim());
  if (!headers.includes('raw_text')) {
    throw new Error('CSV 样本集需包含 raw_text 列及目标字段列（company / position 等）');
  }
  const samples = [];
  for (const cells of rows.slice(1)) {
    const cleaned = {};
    headers.forEach((name, index) => {
      cleaned[name] = String(cells[index] ?? '').trim();
    });
    if (!Object.values(cleaned).some(Boolean)) continue;
    const gold = {};
    for (const name of CSV_GOLD_FIELDS) {
      if (name in cleaned) gold[name] = optText(cleaned[name]);
    }
    gold.is_intern = parseBoolLike(cleaned.is_intern);
    samples.push({
      raw_text: cleaned.raw_text || '',
      gold_labels: gold,
      source_internship_id: optText(cleaned.source_internship_id),
    });
  }
  return samples;
}

export function validateSamples(samples) {
  const validSamples = [];
  const invalidRowNumbers = [];
  samples.forEach((sample, index) => {
    const gold = sample.gold_labels || {};
    const textOk = Boolean(String(sample.raw_text || '').trim());
    const goldOk = optText(gold.company) !== null && optText(gold.position) !== null;
    if (textOk && goldOk) validSamples.push(sample);
    else invalidRowNumbers.push(index + 1);
  });
  return { validSamples, invalidRowNumbers, skippedCount: invalidRowNumbers.length };
}

export async function createSampleSet(db, name, samples, sourceType) {
  const sampleSet = {
    id: uuid(),
    name,
    source_type: sourceType,
    samples: samples.map((sample) => ({
      raw_text: sample.raw_text,
      gold_labels: sample.gold_labels,
      source_internship_id: sample.source_internship_id ?? null,
    })),
    created_at: isoSeconds(new Date()),
  };
  dbRows(await db.from('sample_sets').insert({
    id: sampleSet.id,
    name: sampleSet.name,
    source_type: sampleSet.source_type,
    samples: JSON.stringify(sampleSet.samples),
    created_at: sampleSet.created_at,
  }).select('id'));
  return sampleSet;
}

export async function importSampleSet(db, { filename, contentBase64, name }) {
  const suffix = String(filename || '').toLowerCase();
  const text = decodeText(decodeBase64(contentBase64));
  let samples;
  if (suffix.endsWith('.json')) {
    try {
      samples = parseJsonSamples(JSON.parse(text));
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`JSON 文件解析失败：${error.message}`);
      throw error;
    }
  } else if (suffix.endsWith('.csv')) {
    samples = parseCsvSamples(text);
  } else {
    throw new Error('仅支持上传 .json 或 .csv 样本集文件');
  }
  if (samples.length > SAMPLE_SET_MAX_SIZE) throw new Error('实验上限 100 条，建议分批运行');
  const validation = validateSamples(samples);
  if (!validation.validSamples.length) {
    throw new Error('样本集没有有效条目（每条需包含 raw_text 与 company/position 标注）');
  }
  const sampleSet = await createSampleSet(
    db,
    name || `手工样本_${displayMoment().replace(/[-: ]/g, '_').slice(0, 13)}`,
    validation.validSamples,
    '人工全量标注',
  );
  return { sampleSet, invalidRowNumbers: validation.invalidRowNumbers };
}

export async function exportConfirmedAsSampleSet(db, internshipIds, name) {
  const internships = await loadInternships(db);
  const rawContents = await loadRawContents(db);
  const wanted = new Set(Array.isArray(internshipIds) ? internshipIds : []);
  const samples = [];
  for (const item of internships) {
    if (wanted.size && !wanted.has(item.id)) continue;
    if (item.status !== 'confirmed') continue;
    const raw = item.raw_content_id ? rawContents.get(item.raw_content_id) : null;
    const rawText = raw?.raw_text || '';
    if (!rawText) continue;
    const gold = {};
    for (const field of EVAL_FIELDS) gold[field] = item[field];
    gold.confidence = 1.0;
    samples.push({ raw_text: rawText, gold_labels: gold, source_internship_id: item.id });
  }
  if (!samples.length) throw new Error('已确认岗位均缺少原始抓取文本，无法构成样本');
  return createSampleSet(
    db,
    name || `手工样本_${displayMoment().replace(/[-: ]/g, '_').slice(0, 13)}`,
    samples,
    '采集自动入库',
  );
}

export function variantsOf(experiment) {
  const config = experiment.config || {};
  const modelNames = config.model_names || [];
  if (!modelNames.length) throw new Error('实验缺少候选模型配置');
  if (experiment.kind === KIND_PROMPT_COMPARISON) {
    return (config.prompt_versions || []).map((versionId) => [modelNames[0], versionId]);
  }
  const versionId = (config.prompt_versions || [null])[0];
  if (!versionId) throw new Error('实验缺少 prompt_version 配置');
  return modelNames.map((modelName) => [modelName, versionId]);
}

function normalizeModelNames(modelNames) {
  if (!Array.isArray(modelNames) || !modelNames.length) throw new Error('请至少选择一个候选模型');
  const names = [...new Set(modelNames.map((name) => String(name || '').trim()).filter(Boolean))];
  if (!names.length) throw new Error('请至少选择一个候选模型');
  if (names.length > PUBLIC_SITE_MAX_MODELS) {
    throw new Error(`单次实验最多选择 ${PUBLIC_SITE_MAX_MODELS} 个模型`);
  }
  const unsupported = names.find((name) => !EXPERIMENT_MODELS.includes(name));
  if (unsupported) throw new Error(`仅支持内置模型：${EXPERIMENT_MODELS.join('、')}`);
  return names;
}

export async function createExperiment(db, {
  sampleSetId, modelNames, kind, promptVersions, temperature, maxTokens,
}) {
  const names = normalizeModelNames(modelNames);
  const sampleSet = await getSampleSet(db, sampleSetId);
  if (!sampleSet) throw new Error('样本集不存在');
  const validCount = validateSamples(sampleSet.samples).validSamples.length;
  if (validCount > PUBLIC_SITE_MAX_SAMPLES) {
    throw new Error(`单次实验最多 ${PUBLIC_SITE_MAX_SAMPLES} 条样本；如需更大规模，请拆分样本集分批运行。`);
  }
  const versions = (promptVersions && promptVersions.length)
    ? promptVersions
    : [(await getActivePromptVersion(db)).version_id];
  const config = {
    model_names: names,
    prompt_versions: [...versions],
    new_version: kind === KIND_PROMPT_COMPARISON ? versions[versions.length - 1] : null,
    temperature: Number(temperature ?? EXPERIMENT_DEFAULTS.temperature),
    max_tokens: Number(maxTokens ?? EXPERIMENT_DEFAULTS.maxTokens),
    price_per_1k_tokens: EXPERIMENT_DEFAULTS.pricePer1kTokens,
  };
  const experiment = {
    id: uuid(),
    sample_set_id: sampleSetId,
    kind: kind === KIND_PROMPT_COMPARISON ? KIND_PROMPT_COMPARISON : KIND_MODEL_COMPARISON,
    config,
    status: 'pending',
    note: null,
    created_at: isoSeconds(new Date()),
    finished_at: null,
  };
  dbRows(await db.from('experiments').insert({
    id: experiment.id,
    sample_set_id: experiment.sample_set_id,
    kind: experiment.kind,
    config: JSON.stringify(config),
    status: experiment.status,
    note: null,
    created_at: experiment.created_at,
    finished_at: null,
  }).select('id'));
  return experiment;
}

export async function siteQuotaSnapshot(db) {
  const today = isoSeconds(new Date()).slice(0, 10);
  const experiments = await listExperiments(db, 200);
  let used = 0;
  for (const experiment of experiments) {
    const config = experiment.config || {};
    if (config._site_calls_day !== today) continue;
    used += Number(config._site_calls || 0);
  }
  const limit = publicSiteDailyLimit();
  const collectCalls = await collectLlmCallsToday(db, today);
  used += collectCalls;
  return { day: today, limit, used, remaining: Math.max(0, limit - used), collectCalls };
}

async function siteCallsUsedToday(db, today, currentId, currentCalls) {
  const experiments = await listExperiments(db, 200);
  let total = 0;
  for (const experiment of experiments) {
    const config = experiment.config || {};
    if (experiment.id === currentId) {
      total += currentCalls;
      continue;
    }
    if (config._site_calls_day === today) total += Number(config._site_calls || 0);
  }
  return total + await collectLlmCallsToday(db, today);
}

export function computeMetrics(goldLabels, predictions, sampleIds) {
  if (goldLabels.length !== predictions.length) throw new Error('gold_labels 与 predictions 数量不一致');
  if (!goldLabels.length) {
    return {
      per_field_accuracy: Object.fromEntries(EVAL_FIELDS.map((field) => [field, 0])),
      overall_accuracy: 0,
      overall_recall: 0,
      null_rate_by_field: Object.fromEntries(EVAL_FIELDS.map((field) => [field, 0])),
      error_cases: [],
    };
  }
  const total = goldLabels.length;
  const metrics = { per_field_accuracy: {}, overall_accuracy: 0, overall_recall: 0, null_rate_by_field: {}, error_cases: [] };
  const errorCandidates = [];
  for (const field of EVAL_FIELDS) {
    let correct = 0;
    let nullWrong = 0;
    let goldNonNull = 0;
    goldLabels.forEach((gold, index) => {
      const goldValue = normalizeField(field, (gold || {})[field]);
      const predictedValue = normalizeField(field, (predictions[index] || {})[field]);
      if (goldValue !== null && goldValue !== undefined) goldNonNull += 1;
      if ((goldValue === null || goldValue === undefined) && (predictedValue === null || predictedValue === undefined)) {
        correct += 1;
        return;
      }
      if (goldValue !== null && goldValue !== undefined && (predictedValue === null || predictedValue === undefined)) {
        nullWrong += 1;
      }
      if (goldValue === predictedValue) correct += 1;
      else errorCandidates.push([index, field, goldValue, predictedValue]);
    });
    metrics.per_field_accuracy[field] = correct / total;
    metrics.null_rate_by_field[field] = goldNonNull ? nullWrong / goldNonNull : 0;
  }
  metrics.overall_accuracy = EVAL_FIELDS.reduce((sum, field) => sum + metrics.per_field_accuracy[field], 0) / EVAL_FIELDS.length;
  let recallHits = 0;
  goldLabels.forEach((gold, index) => {
    const prediction = predictions[index] || {};
    const hit = ['company', 'position'].every((field) => {
      const goldValue = normalizeField(field, (gold || {})[field]);
      return goldValue !== null && goldValue !== undefined && goldValue === normalizeField(field, prediction[field]);
    });
    if (hit) recallHits += 1;
  });
  metrics.overall_recall = recallHits / total;
  const priority = new Map(ERROR_FIELD_PRIORITY.map((field, index) => [field, index]));
  errorCandidates.sort((a, b) => (priority.get(a[1]) ?? 99) - (priority.get(b[1]) ?? 99) || a[0] - b[0]);
  for (const [index, field, goldValue, predictedValue] of errorCandidates.slice(0, ERROR_CASE_MAX)) {
    const sourceId = sampleIds ? sampleIds[index] : null;
    metrics.error_cases.push({
      sample_id: sourceId || `s${index + 1}`,
      field,
      gold_value: displayValue(goldValue),
      predicted_value: displayValue(predictedValue),
      error_type: classifyError(field, goldValue, predictedValue),
      source_internship_id: sourceId || null,
    });
  }
  return metrics;
}

function priceOf(config) {
  const price = config.price_per_1k_tokens;
  return price === null || price === undefined ? null : Number(price);
}

function runConfigOf(config, versionId) {
  return {
    prompt_version: versionId,
    temperature: Number(config.temperature ?? 0),
    max_tokens: Number(config.max_tokens ?? 2048),
  };
}

async function insertResult(db, experiment, result) {
  dbRows(await db.from('experiment_results').insert({
    id: result.id,
    experiment_id: experiment.id,
    sample_set_id: experiment.sample_set_id,
    model_name: result.model_name,
    run_config: JSON.stringify(result.run_config),
    run_status: result.run_status,
    per_field_accuracy: JSON.stringify(result.per_field_accuracy),
    overall_accuracy: String(result.overall_accuracy),
    overall_recall: String(result.overall_recall),
    null_rate_by_field: JSON.stringify(result.null_rate_by_field),
    error_cases: JSON.stringify(result.error_cases || []),
    run_duration_ms: result.run_duration_ms,
    token_cost: result.token_cost === null || result.token_cost === undefined ? null : String(result.token_cost),
    created_at: result.created_at,
  }).select('id'));
}

async function clearFailedVariant(db, experimentId, modelName, versionId) {
  const results = await listResults(db, experimentId);
  for (const result of results) {
    if (result.model_name === modelName
      && result.run_config.prompt_version === versionId
      && result.run_status === 'failed') {
      dbRows(await db.from('experiment_results').delete().eq('id', result.id).select('id'));
    }
  }
}

function failedResult(experiment, modelName, versionId, config) {
  return {
    id: uuid(),
    experiment_id: experiment.id,
    sample_set_id: experiment.sample_set_id,
    model_name: modelName,
    run_config: runConfigOf(config, versionId),
    run_status: 'failed',
    per_field_accuracy: Object.fromEntries(EVAL_FIELDS.map((field) => [field, 0])),
    overall_accuracy: 0,
    overall_recall: 0,
    null_rate_by_field: Object.fromEntries(EVAL_FIELDS.map((field) => [field, 0])),
    error_cases: [],
    run_duration_ms: 0,
    token_cost: null,
    created_at: isoSeconds(new Date()),
  };
}

async function finalizeExperiment(db, experiment) {
  const results = await listResults(db, experiment.id);
  const failedModels = [...new Set(
    results.filter((result) => result.run_status === 'failed').map((result) => result.model_name),
  )].sort();
  const notes = [];
  if (failedModels.length) notes.push(`运行失败：${failedModels.join('、')}`);
  const skippedTotal = Number(experiment.config?._skipped_total || 0);
  if (skippedTotal) notes.push(`跳过 ${skippedTotal} 条无效样本`);
  const status = failedModels.length ? 'failed' : 'completed';
  const config = { ...(experiment.config || {}) };
  delete config._progress;
  delete config._skipped_total;
  await saveExperimentPatch(db, experiment.id, {
    status,
    note: notes.length ? notes.join('；') : null,
    finished_at: isoSeconds(new Date()),
    config: JSON.stringify({ ...config, _skipped_total: skippedTotal }),
  });
  if (status === 'completed') await backfillImprovement(db, experiment, config);
  return { status, note: notes.length ? notes.join('；') : null };
}

async function backfillImprovement(db, experiment, config) {
  if (experiment.kind !== KIND_PROMPT_COMPARISON) return;
  const versions = config.prompt_versions || [];
  if (versions.length < 2) return;
  const results = await listResults(db, experiment.id);
  const accuracies = {};
  for (const result of results) {
    if (result.run_status !== 'completed') continue;
    accuracies[result.run_config.prompt_version] = result.overall_accuracy;
  }
  const oldVersion = versions[0];
  const newVersion = versions[versions.length - 1];
  if (oldVersion in accuracies && newVersion in accuracies) {
    const improvement = Math.round((accuracies[newVersion] - accuracies[oldVersion]) * 10000) / 10000;
    dbRows(await db.from('prompt_versions')
      .update({ accuracy_improvement: String(improvement) })
      .eq('version_id', newVersion)
      .select('version_id'));
  }
}

function progressSummary(progress, variants) {
  return {
    variantIndex: progress.variantIndex,
    variantCount: variants.length,
    modelName: variants[progress.variantIndex]?.[0] || '',
    promptVersion: variants[progress.variantIndex]?.[1] || '',
    offset: progress.offset,
    skipped: progress.skipped,
  };
}

export async function runBatch({
  db, llm, experimentId, budget = 4, maxMs = 20000,
}) {
  const experiment = await getExperiment(db, experimentId);
  if (!experiment) throw new Error('实验不存在');
  if (experiment.status === 'completed') {
    return { done: true, status: 'completed', note: experiment.note || null };
  }
  const sampleSet = await getSampleSet(db, experiment.sample_set_id);
  if (!sampleSet) throw new Error('实验关联的样本集不存在');
  const validation = validateSamples(sampleSet.samples);
  if (validation.validSamples.length < SAMPLE_SET_MIN_SIZE) {
    throw new Error('样本集不足 10 条，无法启动实验，请补充样本后重试');
  }
  const valid = validation.validSamples;
  const variants = variantsOf(experiment);
  const config = { ...(experiment.config || {}) };
  const runner = llm;
  const today = isoSeconds(new Date()).slice(0, 10);
  if (config._site_calls_day !== today) {
    config._site_calls_day = today;
    config._site_calls = 0;
  }
  let siteCalls = Number(config._site_calls || 0);
  const used = await siteCallsUsedToday(db, today, experiment.id, siteCalls);
  let siteRemaining = Math.max(0, publicSiteDailyLimit() - used);
  let progress = config._progress || null;
  let index = progress?.variantIndex ?? 0;
  let processed = 0;
  const started = Date.now();
  let results = await listResults(db, experimentId);

  if (experiment.status !== 'running') {
    await saveExperimentPatch(db, experimentId, { status: 'running', note: null });
  }

  while (index < variants.length) {
    const [modelName, versionId] = variants[index];
    const completed = results.some((result) => result.model_name === modelName
      && result.run_config.prompt_version === versionId
      && result.run_status === 'completed');
    if (completed) {
      index += 1;
      progress = null;
      delete config._progress;
      continue;
    }
    if (!progress || progress.variantIndex !== index) {
      await clearFailedVariant(db, experimentId, modelName, versionId);
      results = await listResults(db, experimentId);
      progress = {
        variantIndex: index, offset: 0, golds: [], preds: [], sampleIds: [],
        skipped: 0, promptTokens: 0, completionTokens: 0, startedMs: Date.now(),
      };
    }
    const version = await getPromptVersion(db, versionId);
    const temperature = Number(config.temperature ?? 0);
    const maxTokens = Number(config.max_tokens ?? 2048);
    try {
      while (progress.offset < valid.length && processed < budget && Date.now() - started < maxMs) {
        if (siteRemaining <= 0) {
          config._progress = progress;
          config._site_calls = siteCalls;
          config._site_calls_day = today;
          const note = '今日站点 LLM 额度已用完，请明天再试。';
          await saveExperimentPatch(db, experimentId, {
            status: 'running', note, config: JSON.stringify(config),
          });
          return {
            done: true, status: 'running', paused: true, note,
            progress: progressSummary(progress, variants), skipped: validation.skippedCount,
          };
        }
        const sample = valid[progress.offset];
        const prompt = buildProductionPrompt(version, preprocess(sample.raw_text));
        let data;
        let usage = {};
        try {
          siteCalls += 1;
          siteRemaining -= 1;
          config._site_calls = siteCalls;
          config._site_calls_day = today;
          const output = await runner({ model: modelName, temperature, maxTokens, prompt });
          validateLlmOutput(output.data);
          data = output.data;
          usage = output.usage || {};
        } catch (error) {
          if (error instanceof LlmError && String(error.message).includes('未配置')) {
            throw new Error('站点 LLM 尚未配置，请在站点设置中填写 INTERNRADAR_LLM_API_BASE 与 INTERNRADAR_LLM_API_KEY 后重试。');
          }
          if (error instanceof LlmError && /HTTP (401|403)/.test(error.message)) {
            throw new Error('LLM 鉴权失败，请检查站点 LLM 密钥配置。');
          }
          if (error instanceof LlmError && /HTTP 404/.test(error.message)) {
            throw new Error('模型或接口地址不可用，请检查模型名称与站点 LLM 接口地址。');
          }
          if (isQuotaError(error)) {
            config._progress = progress;
            const note = 'API 配额耗尽，实验已暂停，已完成模型结果保留';
            config._skipped_total = Number(config._skipped_total || 0) + progress.skipped;
            await saveExperimentPatch(db, experimentId, {
              status: 'failed', note, finished_at: isoSeconds(new Date()), config: JSON.stringify(config),
            });
            return {
              done: true, status: 'failed', paused: true, note,
              progress: progressSummary(progress, variants), skipped: validation.skippedCount,
            };
          }
          progress.skipped += 1;
          progress.offset += 1;
          processed += 1;
          continue;
        }
        progress.promptTokens += Number(usage.prompt_tokens || 0);
        progress.completionTokens += Number(usage.completion_tokens || 0);
        progress.golds.push(sample.gold_labels || {});
        progress.preds.push(data);
        progress.sampleIds.push(sample.source_internship_id || '');
        progress.offset += 1;
        processed += 1;
      }
    } catch (error) {
      if (isQuotaError(error)) {
        config._progress = progress;
        const note = 'API 配额耗尽，实验已暂停，已完成模型结果保留';
        await saveExperimentPatch(db, experimentId, {
          status: 'failed', note, finished_at: isoSeconds(new Date()), config: JSON.stringify(config),
        });
        return { done: true, status: 'failed', paused: true, note };
      }
      const result = failedResult(experiment, modelName, versionId, config);
      await insertResult(db, experiment, result);
      results = await listResults(db, experimentId);
      index += 1;
      progress = null;
      delete config._progress;
      await saveExperimentPatch(db, experimentId, { config: JSON.stringify(config) });
      continue;
    }

    if (progress.offset < valid.length) {
      config._progress = progress;
      await saveExperimentPatch(db, experimentId, {
        status: 'running', config: JSON.stringify(config),
      });
      return {
        done: false,
        status: 'running',
        progress: progressSummary(progress, variants),
        variants: variants.length,
        processed,
        skipped: validation.skippedCount,
      };
    }

    const durationMs = Math.max(0, Date.now() - progress.startedMs);
    const price = priceOf(config);
    let tokenCost = null;
    if (price !== null && (progress.promptTokens || progress.completionTokens)) {
      tokenCost = (progress.promptTokens + progress.completionTokens) / 1000 * price;
    }
    let result;
    if (!progress.preds.length) {
      result = failedResult(experiment, modelName, versionId, config);
      result.run_duration_ms = durationMs;
      result.token_cost = tokenCost === null ? null : Number(tokenCost.toFixed(4));
      result.created_at = isoSeconds(new Date());
    } else {
      const metrics = computeMetrics(progress.golds, progress.preds, progress.sampleIds);
      result = {
        id: uuid(),
        experiment_id: experiment.id,
        sample_set_id: experiment.sample_set_id,
        model_name: modelName,
        run_config: runConfigOf(config, versionId),
        run_status: 'completed',
        ...metrics,
        run_duration_ms: durationMs,
        token_cost: tokenCost === null ? null : Number(tokenCost.toFixed(4)),
        created_at: isoSeconds(new Date()),
      };
    }
    await insertResult(db, experiment, result);
    results = await listResults(db, experimentId);
    config._skipped_total = Number(config._skipped_total || 0) + progress.skipped;
    index += 1;
    progress = null;
    delete config._progress;
    await saveExperimentPatch(db, experimentId, { status: 'running', config: JSON.stringify(config) });
    if (Date.now() - started >= maxMs) break;
  }

  if (index >= variants.length) {
    const final = await finalizeExperiment(db, { ...experiment, config });
    return { done: true, status: final.status, note: final.note, variants: variants.length };
  }
  return {
    done: false,
    status: 'running',
    progress: { variantIndex: index, variantCount: variants.length, offset: 0, skipped: 0 },
    variants: variants.length,
    processed,
  };
}

export async function abandonExperiment(db, experimentId) {
  const experiment = await getExperiment(db, experimentId);
  if (!experiment) throw new Error('实验不存在');
  if (experiment.status === 'completed') throw new Error('实验已完成，无需放弃');
  const config = { ...(experiment.config || {}) };
  delete config._progress;
  await saveExperimentPatch(db, experimentId, {
    status: 'failed', note: NOTE_ABANDONED, finished_at: isoSeconds(new Date()), config: JSON.stringify(config),
  });
  return { status: 'failed', note: NOTE_ABANDONED };
}

export async function exportMarkdownReport(db, experimentId) {
  const experiment = await getExperiment(db, experimentId);
  if (!experiment) throw new Error('实验不存在');
  const results = await listResults(db, experimentId);
  const sampleSet = await getSampleSet(db, experiment.sample_set_id);
  const sampleCount = sampleSet ? validateSamples(sampleSet.samples).validSamples.length : 0;
  const completed = results.filter((result) => result.run_status === 'completed');
  const kindLabel = experiment.kind === KIND_PROMPT_COMPARISON ? '提示词对比' : '模型对比';
  const lines = [
    '# 解析实验报告',
    '',
    `- 实验 ID：${experiment.id}`,
    `- 实验类型：${kindLabel}`,
    `- 样本集：${sampleSet ? sampleSet.name : '（缺失）'}（${sampleCount} 条有效样本）`,
    `- 实验状态：${experiment.status}`,
    `- 生成时间：${displayMoment()}`,
    '',
    '## 模型对比表',
    '',
    '| 模型 | prompt 版本 | 整体准确率 | 整体召回率 | 平均每条耗时 | token 成本 |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const result of results) {
    if (result.run_status !== 'completed') {
      lines.push(`| ${result.model_name} | ${result.run_config.prompt_version} | 运行失败 | — | — | — |`);
      continue;
    }
    const perSampleMs = sampleCount ? result.run_duration_ms / sampleCount : 0;
    const cost = result.token_cost === null ? '—' : `${result.token_cost.toFixed(4)} 元`;
    lines.push(
      `| ${result.model_name} | ${result.run_config.prompt_version} `
      + `| ${formatPercent(result.overall_accuracy)} | ${formatPercent(result.overall_recall)} `
      + `| ${perSampleMs.toFixed(0)} ms | ${cost} |`,
    );
  }
  lines.push('', '## 字段准确率排行', '');
  lines.push(`| 字段 | ${completed.map((result) => result.model_name).join(' | ')} | 平均 |`);
  lines.push(`| --- |${' --- |'.repeat(completed.length)} --- |`);
  for (const field of EVAL_FIELDS) {
    const values = completed.map((result) => result.per_field_accuracy[field] ?? 0);
    const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const cells = values.length ? values.map((value) => formatPercent(value)).join(' | ') : '—';
    lines.push(`| ${field} | ${cells} | ${formatPercent(average)} |`);
  }
  lines.push('', '## 最差字段说明', '');
  if (completed.length) {
    for (const result of completed) {
      const ranked = Object.entries(result.per_field_accuracy).sort((a, b) => a[1] - b[1]);
      const [worstField, worstAccuracy] = ranked[0];
      const nullRate = result.null_rate_by_field[worstField] ?? 0;
      const hint = nullRate > 0.3 ? '，null_rate 超过 30%，建议补充抽取规则' : '';
      lines.push(
        `- ${result.model_name}：最差字段 \`${worstField}\`（准确率 ${formatPercent(worstAccuracy)}，`
        + `null_rate ${formatPercent(nullRate)}${hint}）`,
      );
    }
  } else {
    lines.push('- 无成功完成的模型结果。');
  }
  lines.push('', '## 错误案例摘要', '');
  if (completed.length) {
    for (const result of completed) {
      lines.push(`### ${result.model_name}`);
      if (!result.error_cases.length) {
        lines.push('- 无错误案例。');
        continue;
      }
      for (const errorCase of result.error_cases) {
        lines.push(
          `- 字段 \`${errorCase.field}\`：正确值 ${errorCase.gold_value || 'null'} / 模型输出 `
          + `${errorCase.predicted_value || 'null'}（${errorCase.error_type || '未分类'}）`,
        );
      }
      lines.push('');
    }
  } else {
    lines.push('- 无错误案例。');
  }
  lines.push('', '## 实验配置', '');
  for (const result of results) {
    lines.push(
      `- ${result.model_name}：prompt_version=${result.run_config.prompt_version}，`
      + `temperature=${result.run_config.temperature}，max_tokens=${result.run_config.max_tokens}`,
    );
  }
  lines.push(`- 样本量：${sampleCount} 条`);
  return lines.join('\n').trimEnd() + '\n';
}

// ---- 4.4.2 从人工确认队列导出样本集（已在 review 流程中复用 exportConfirmedAsSampleSet）----

// ---- 4.2.6 Prompt 演进 ----

function goldLabelOf(item) {
  const gold = {};
  for (const field of EVAL_FIELDS) gold[field] = item[field];
  gold.confidence = 1.0;
  return gold;
}

async function samplePool(db) {
  const internships = await loadInternships(db);
  const rawContents = await loadRawContents(db);
  return internships.filter((item) => item.status === 'confirmed'
    && item.raw_content_id
    && item.edited_fields.length
    && Boolean(rawContents.get(item.raw_content_id)?.raw_text));
}

export async function shouldEvolve(db) {
  const active = await getActivePromptVersion(db);
  const createdAt = new Date(active.created_at).getTime();
  if (!Number.isFinite(createdAt)) return false;
  if (Date.now() - createdAt < FEWSHOT_MIN_AGE_HOURS * 3600 * 1000) return false;
  return (await samplePool(db)).length >= 10;
}

function selectFewShotSamples(pool, rawTextOf) {
  if (!pool.length) return [];
  const deadlineFixes = [];
  const locationFixes = [];
  const companyFixes = [];
  const others = [];
  for (const item of pool) {
    const edited = new Set(item.edited_fields);
    if (edited.has('deadline') && item.deadline && item.deadline_raw) deadlineFixes.push(item);
    else if (edited.has('location')) locationFixes.push(item);
    else if (edited.has('company')) companyFixes.push(item);
    else others.push(item);
  }
  for (const group of [deadlineFixes, locationFixes, companyFixes, others]) {
    for (let index = group.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [group[index], group[swap]] = [group[swap], group[index]];
    }
  }
  const ordered = [...deadlineFixes, ...locationFixes, ...companyFixes, ...others];
  const count = Math.max(FEWSHOT_MIN_COUNT, Math.min(pool.length, FEWSHOT_MAX_COUNT));
  return ordered.slice(0, count).map((item) => ({
    raw_text_excerpt: String(rawTextOf(item) || '').slice(0, 300),
    gold_label: goldLabelOf(item),
    source_internship_id: item.id,
  }));
}

export async function createImprovementExperiment(db, newVersionId, previousVersionId) {
  const pool = await samplePool(db);
  const rawContents = await loadRawContents(db);
  const samples = pool
    .map((item) => ({ item, raw: rawContents.get(item.raw_content_id) }))
    .filter(({ raw }) => Boolean(raw?.raw_text))
    .map(({ item, raw }) => ({
      raw_text: raw.raw_text,
      gold_labels: goldLabelOf(item),
      source_internship_id: item.id,
    }));
  if (samples.length < SAMPLE_SET_MIN_SIZE) return null;
  const sampleSet = await createSampleSet(
    db,
    `演进对比样本_${displayMoment().replace(/[-: ]/g, '_').slice(0, 13)}`,
    samples,
    'LLM 初标 + 人工复核',
  );
  const experiment = await createExperiment(db, {
    sampleSetId: sampleSet.id,
    modelNames: [EXPERIMENT_MODELS[0]],
    kind: KIND_PROMPT_COMPARISON,
    promptVersions: [previousVersionId, newVersionId],
    temperature: EXPERIMENT_DEFAULTS.temperature,
    maxTokens: EXPERIMENT_DEFAULTS.maxTokens,
  });
  return experiment.id;
}

export async function maybeEvolvePrompt(db) {
  if (!(await shouldEvolve(db))) return null;
  const pool = await samplePool(db);
  const rawContents = await loadRawContents(db);
  const samples = selectFewShotSamples(pool, (item) => rawContents.get(item.raw_content_id)?.raw_text);
  if (!samples.length) return null;
  const previous = await getActivePromptVersion(db);
  const versions = await listPromptVersions(db);
  const version = {
    version_id: nextVersionId(versions.map((item) => item.version_id)),
    base_prompt: previous.base_prompt,
    few_shot_samples: samples.slice(0, FEWSHOT_MAX_COUNT),
    trigger_reason: 'auto_accumulated_samples',
    accuracy_improvement: null,
    created_at: isoSeconds(new Date()),
    is_active: true,
  };
  dbRows(await db.from('prompt_versions').update({ is_active: 0 }).eq('is_active', 1).select('version_id'));
  dbRows(await db.from('prompt_versions').insert({
    version_id: version.version_id,
    base_prompt: version.base_prompt,
    few_shot_samples: JSON.stringify(version.few_shot_samples),
    trigger_reason: version.trigger_reason,
    accuracy_improvement: null,
    created_at: version.created_at,
    is_active: 1,
  }).select('version_id'));
  const after = await listPromptVersions(db);
  const sorted = after.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  for (const stale of sorted.slice(PROMPT_VERSION_KEEP)) {
    dbRows(await db.from('prompt_versions').delete().eq('version_id', stale.version_id).select('version_id'));
  }
  try {
    await createImprovementExperiment(db, version.version_id, previous.version_id);
  } catch {
    // 演进主流程不被对比实验创建失败阻断
  }
  return version;
}

export async function rollbackPromptVersion(db, versionId) {
  const versions = await listPromptVersions(db);
  if (!versions.some((version) => version.version_id === versionId)) throw new Error('prompt 版本不存在');
  const target = versions.find((version) => version.version_id === versionId);
  dbRows(await db.from('prompt_versions').update({ is_active: 0 }).eq('is_active', 1).select('version_id'));
  dbRows(await db.from('prompt_versions').update({ is_active: 1 }).eq('version_id', versionId).select('version_id'));
  return target;
}

export function inferDirectionFor(position, company) {
  return inferDirection(position, company);
}

// 暴露给 review 流程的常量
export { KIND_MODEL_COMPARISON, KIND_PROMPT_COMPARISON };
export { toBool, parseJson };
