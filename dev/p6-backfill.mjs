import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tokenFile = path.join(root, '.admin-token');
const token = process.env.INTERNRADAR_ADMIN_TOKEN
  || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : '');
if (!token) {
  throw new Error('缺少管理员令牌：请设置 INTERNRADAR_ADMIN_TOKEN 或创建 web/.admin-token');
}

const base = 'https://careerscope-tb8isknpdbc.qoder.zone/functions/v1/app/api';
const LIMIT = 200;

async function postAdmin(route, body) {
  const response = await fetch(`${base}${route}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': token,
      origin: 'https://careerscope-tb8isknpdbc.qoder.zone',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${route} ${response.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function paged(route, extra, { apply }) {
  let offset = 0;
  let scanned = 0;
  let changed = 0;
  const samples = [];
  for (;;) {
    const page = await postAdmin(route, { ...extra, dryRun: !apply, offset, limit: LIMIT });
    scanned += page.scanned;
    changed += page.dryRun ? (page.affected ?? page.scanned ?? 0) : (page.updated ?? 0);
    samples.push(...(page.samples || []));
    if (!page.hasMore || !page.nextOffset) break;
    offset = page.nextOffset;
  }
  return { scanned, changed, samples: samples.slice(0, 10) };
}

const [mode = 'dry-run', batchArg, applyArg] = process.argv.slice(2);

if (mode === 'apply') {
  const batchId = `p6-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8)}`;
  const result = await paged('/admin/maintenance/classify', { batchId }, { apply: true });
  console.log(JSON.stringify({ mode: 'apply', batchId, ...result, rollback: `node dev/p6-backfill.mjs rollback ${batchId}` }, null, 2));
} else if (mode === 'rollback') {
  if (!batchArg) throw new Error('用法：node dev/p6-backfill.mjs rollback <batchId> [apply]');
  const apply = applyArg === 'apply';
  const result = await paged('/admin/maintenance/rollback', { batchId: batchArg }, { apply });
  console.log(JSON.stringify({ mode: apply ? 'rollback-apply' : 'rollback-dry-run', batchId: batchArg, ...result }, null, 2));
} else {
  const result = await paged('/admin/maintenance/classify', {}, { apply: false });
  console.log(JSON.stringify({ mode: 'dry-run', ...result }, null, 2));
}
