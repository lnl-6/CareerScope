import { classifyJob } from "../functions/core.mjs";

const BASE = "https://careerscope-tb8isknpdbc.qoder.zone/functions/v1/app";
const PAGE_SIZE = 60;

async function fetchPage(page) {
  const res = await fetch(`${BASE}/api/jobs?type=all&pageSize=${PAGE_SIZE}&page=${page}`);
  if (!res.ok) throw new Error(`page ${page}: ${res.status}`);
  return res.json();
}

async function loadAll() {
  const first = await fetchPage(1);
  const pages = Math.ceil(first.total / PAGE_SIZE);
  const byId = new Map();
  const add = (rows) => rows.forEach((row) => byId.set(row.id, row));
  add(first.jobs || []);
  let next = 2;
  async function worker() {
    while (next <= pages) {
      const page = next++;
      add((await fetchPage(page)).jobs || []);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return [...byId.values()];
}

const rows = await loadAll();
const changed = [];
const fieldCounts = {};
const eduAfter = {};
const directionPairs = {};
for (const row of rows) {
  const c = classifyJob({
    company: row.company,
    position: row.position,
    majorRequirements: row.majorRequirements,
    positionType: row.positionType,
    sourceIndustry: row.industrySource === "source" ? row.industry : null,
    location: row.location,
    applyLink: row.applyLink,
    sourceUrl: row.sourceUrl,
  });
  const patch = {};
  if (row.positionType !== c.position_type) patch.position_type = [row.positionType, c.position_type];
  if (Boolean(row.isIntern) !== Boolean(c.is_intern)) patch.is_intern = [row.isIntern, c.is_intern];
  if (row.direction !== c.direction) { patch.direction = [row.direction, c.direction]; const k = `${row.direction || "(空)"}→${c.direction || "(空)"}`; directionPairs[k] = (directionPairs[k] || 0) + 1; }
  if (row.industry !== c.industry) patch.industry = [row.industry, c.industry];
  if ((row.industrySource ?? null) !== c.industry_source) patch.industry_source = [row.industrySource, c.industry_source];
  if (row.industry === "教育培训") eduAfter[c.industry ?? "(空)"] = (eduAfter[c.industry ?? "(空)"] || 0) + 1;
  if (Object.keys(patch).length) {
    for (const key of Object.keys(patch)) fieldCounts[key] = (fieldCounts[key] || 0) + 1;
    changed.push({ company: row.company, position: row.position, location: row.location, patch });
  }
}

console.log(JSON.stringify({
  scanned: rows.length,
  affected: fieldCounts.direction ? rows.filter(() => true).length : 0,
  changedRows: fieldCounts,
  affectedRows: (() => {
    let n = 0;
    for (const row of rows) {
      const c = classifyJob({
        company: row.company,
        position: row.position,
        majorRequirements: row.majorRequirements,
        positionType: row.positionType,
        sourceIndustry: row.industrySource === "source" ? row.industry : null,
        location: row.location,
        applyLink: row.applyLink,
        sourceUrl: row.sourceUrl,
      });
      if (row.positionType !== c.position_type || Boolean(row.isIntern) !== Boolean(c.is_intern)
        || row.direction !== c.direction || row.industry !== c.industry
        || (row.industrySource ?? null) !== c.industry_source) n += 1;
    }
    return n;
  })(),
  fieldCounts,
  eduWouldBecome: eduAfter,
  directionPairs,
  samples: changed,
}, null, 2));
