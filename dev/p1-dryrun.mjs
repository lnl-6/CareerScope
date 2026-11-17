// P1 只读 dry-run：基于 P0 基线快照评估链接、来源、去重与分类改动的影响，不写任何数据。
import { readFile } from 'node:fs/promises';
import {
  classifyJob, canonicalSourceName, jobDedupeKey, linkKind, mergeLocations, directionGroupOf,
} from '../functions/core.mjs';

const baseline = JSON.parse(await readFile(new URL('./p0-baseline-2026-11-16.json', import.meta.url), 'utf8'));
const jobs = baseline.jobs;

const linkChanges = new Map();
let trackable = 0;
let blocked = 0;
const sourceNames = new Map();
const directionCleared = [];
const directionChanged = [];
const industryChanged = [];
const groups = new Map();

for (const job of jobs) {
  const before = job.linkKind;
  const after = linkKind(job.applyLink, job.sourceUrl);
  const key = `${before} -> ${after}`;
  linkChanges.set(key, (linkChanges.get(key) || 0) + 1);
  if (after === 'job_detail') trackable += 1;
  else blocked += 1;

  const sourceBefore = job.sourceName || '';
  const sourceAfter = canonicalSourceName(sourceBefore);
  const sourceKey = `${sourceBefore} -> ${sourceAfter}`;
  sourceNames.set(sourceKey, (sourceNames.get(sourceKey) || 0) + 1);

  const classification = classifyJob({
    company: job.company,
    position: job.position,
    positionType: job.positionType,
    sourceIndustry: job.industrySource === 'source' ? job.industry : null,
    location: job.location,
    applyLink: job.applyLink,
    sourceUrl: job.sourceUrl,
  });
  if (job.direction && !classification.direction) {
    directionCleared.push({ id: job.id, company: job.company, position: job.position, before: job.direction });
  } else if (job.direction !== classification.direction) {
    directionChanged.push({
      id: job.id, company: job.company, position: job.position, before: job.direction, after: classification.direction,
    });
  }
  if (job.industry !== classification.industry) {
    industryChanged.push({
      id: job.id, company: job.company, position: job.position, before: job.industry, after: classification.industry,
    });
  }

  const dedupe = jobDedupeKey(job.company, job.position);
  if (dedupe) {
    const type = job.positionType || '校招';
    const groupKey = `${dedupe}|${type}`;
    const entry = groups.get(groupKey) || { company: job.company, position: job.position, type, rows: [] };
    entry.rows.push(job);
    groups.set(groupKey, entry);
  }
}

const duplicateGroups = [...groups.values()].filter((entry) => entry.rows.length > 1);
const duplicateExtra = duplicateGroups.reduce((sum, entry) => sum + entry.rows.length - 1, 0);
const mergedLocationChanges = [];
for (const entry of duplicateGroups) {
  const representative = entry.rows[0];
  const merged = mergeLocations(...entry.rows.map((row) => row.location));
  if (merged && merged !== representative.location) {
    mergedLocationChanges.push({
      company: entry.company, position: entry.position, type: entry.type,
      before: representative.location, after: merged, rows: entry.rows.length,
    });
  }
}

const groupCounts = new Map();
for (const job of jobs) {
  const group = directionGroupOf(job.direction) || '空';
  groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
}

const sample = (list, size = 8) => list.slice(0, size);

console.log(JSON.stringify({
  total: jobs.length,
  linkChanges: Object.fromEntries([...linkChanges.entries()].sort((a, b) => b[1] - a[1])),
  tracking: { trackable, blocked },
  sourceNames: Object.fromEntries([...sourceNames.entries()].filter(([key]) => key.split(' -> ')[0] !== key.split(' -> ')[1])),
  direction: {
    cleared: directionCleared.length,
    changed: directionChanged.length,
    clearedSamples: sample(directionCleared),
    changedSamples: sample(directionChanged),
  },
  industry: {
    changed: industryChanged.length,
    samples: sample(industryChanged),
  },
  dedupe: {
    groups: duplicateGroups.length,
    rowsToMerge: duplicateExtra,
    groupsWithMergedCities: mergedLocationChanges.length,
    samples: sample(duplicateGroups.map((entry) => ({
      company: entry.company,
      position: entry.position,
      type: entry.type,
      rows: entry.rows.length,
      locations: entry.rows.map((row) => row.location),
    }))),
    mergedCitySamples: sample(mergedLocationChanges),
  },
  directionGroupsBefore: Object.fromEntries(groupCounts),
}, null, 2));