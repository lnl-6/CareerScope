// 本地预览服务器：静态 dist + 注入内存 DB 的 Edge Function（仅本地验证用）。
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryDb } from './memory-db.mjs';
import { application } from '../functions/routes.mjs';

const ROOT = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = Number(process.env.PORT || 4173);
globalThis.Deno = { env: { get: (name) => process.env[name] } };
process.env.INTERNRADAR_LOCAL_DEV ||= '1';
process.env.INTERNRADAR_LLM_API_BASE ||= 'http://127.0.0.1:9/fake';
process.env.INTERNRADAR_LLM_API_KEY ||= 'fake-key';

const now = new Date();
const iso = (offsetSeconds = 0) => new Date(now.getTime() - offsetSeconds * 1000).toISOString().slice(0, 19) + 'Z';
const rawA = 'a'.repeat(32);
const rawB = 'b'.repeat(32);

const internships = [
  {
    id: '1'.repeat(32), company: '字节跳动', position_title: '运维开发实习生', location: '北京',
    position_type: '实习', is_intern: 1, major_requirements: '计算机、软件工程相关专业',
    apply_link: 'https://jobs.bytedance.com/job-100-001-001.html', deadline: '2026-11-18', deadline_raw: null,
    pay: '4k-6k/月', published_at: iso(172800),
    source_url: 'https://example.com/a', source_name: '牛客', confidence: 0.92, source_model: 'qwen-max-v2',
    source_prompt_version: 'prod_fewshot_v1', status: 'confirmed', created_at: iso(86400), updated_at: iso(3600),
    direction: '技术', company_nature: '民企', raw_content_id: rawA, additional_sources: '[]', edited_fields: '[]',
  },
  {
    id: '2'.repeat(32), company: '美团', position_title: '数据开发实习生', location: '北京',
    position_type: '实习', is_intern: 1, major_requirements: '计算机相关专业，熟悉 SQL',
    apply_link: null, deadline: '2026-11-25', deadline_raw: null,
    pay: '300-500/天', published_at: iso(259200),
    source_url: 'https://example.com/b', source_name: 'BOSS直聘', confidence: 0.88, source_model: 'doubao-lite-32k',
    source_prompt_version: 'prod_fewshot_v1', status: 'confirmed', created_at: iso(172800), updated_at: iso(7200),
    direction: '数据与算法', company_nature: '民企', raw_content_id: rawB, additional_sources: '["牛客"]', edited_fields: '["company"]',
  },
  {
    id: '3'.repeat(32), company: '中国移动', position_title: '数据分析实习生', location: '杭州',
    position_type: '实习', is_intern: 1, major_requirements: '统计学、数学相关专业',
    apply_link: null, deadline: null, deadline_raw: '本月底',
    pay: '200-300/天', published_at: iso(3600),
    source_url: 'https://example.com/c', source_name: '官网', confidence: 0.81, source_model: 'qwen-max-v2',
    source_prompt_version: 'prod_fewshot_v1', status: 'pending_review', created_at: iso(21600), updated_at: iso(21600),
    direction: null, company_nature: '国企', raw_content_id: rawB, additional_sources: '[]', edited_fields: '[]',
  },
  {
    id: '4'.repeat(32), company: '某创业公司', position_title: '算法实习生（远程）', location: null,
    position_type: '实习', is_intern: 1, major_requirements: null,
    apply_link: null, deadline: null, deadline_raw: null,
    source_url: 'https://example.com/d', source_name: '牛客', confidence: 0.62, source_model: 'doubao-lite-32k',
    source_prompt_version: 'prod_fewshot_v1', status: 'pending_review', created_at: iso(10800), updated_at: iso(10800),
    direction: '数据与算法', company_nature: '民企', raw_content_id: null, additional_sources: '[]', edited_fields: '[]',
  },
  {
    id: '5'.repeat(32), company: '示例银行', position_title: '金融科技实习生', location: '上海',
    position_type: '实习', is_intern: 1, major_requirements: '金融、计算机相关专业',
    apply_link: null, deadline: '2026-11-01', deadline_raw: null,
    pay: '250-350/天', published_at: iso(864000),
    source_url: 'https://example.com/e', source_name: '应届生求职网', confidence: 0.74, source_model: 'qwen-max-v2',
    source_prompt_version: 'prod_fewshot_v1', status: 'confirmed', created_at: iso(864000), updated_at: iso(86400),
    direction: '技术', company_nature: '国企', raw_content_id: null, additional_sources: '[]', edited_fields: '[]',
  },
  {
    id: '6'.repeat(32), company: '示例传媒', position_title: '新媒体运营实习生', location: '广州',
    position_type: '实习', is_intern: 1, major_requirements: '新闻、中文相关专业',
    apply_link: 'https://example.com/f', deadline: null, deadline_raw: null,
    pay: null, published_at: iso(43200),
    source_url: 'https://example.com/f', source_name: '牛客', confidence: 0.8, source_model: 'qwen-max-v2',
    source_prompt_version: 'prod_fewshot_v1', status: 'confirmed', created_at: iso(43200), updated_at: iso(43200),
    direction: '运营', company_nature: '民企', raw_content_id: null, additional_sources: '[]', edited_fields: '[]',
  },
];

const rawContents = [
  {
    id: rawA, file_path: 'raw/a.raw', source_name: '牛客', source_url: 'https://example.com/a',
    crawled_at: iso(86400), parse_status: 'success', error_message: null,
    raw_text: '<p>字节跳动 运维开发实习生 北京 计算机相关专业 截止 2026 年 12 月 31 日</p><p>负责 SRE 平台开发与值班。</p>',
  },
  {
    id: rawB, file_path: 'raw/b.raw', source_name: 'BOSS直聘', source_url: 'https://example.com/b',
    crawled_at: iso(172800), parse_status: 'success', error_message: null,
    raw_text: '<p>美团 数据开发实习生 北京 熟悉 SQL 与数仓建模 本月底截止</p>',
  },
];

const applications = [
  {
    id: '9'.repeat(32), internship_id: '1'.repeat(32), applied_at: '2026-11-10', notes: '内推码 ABC123',
    status: 'interview', updated_at: iso(1800),
  },
];

const sampleSetId = '7'.repeat(32);
const samples = Array.from({ length: 10 }, (_, index) => ({
  raw_text: `字节跳动 运维开发实习生 北京 2026-12-31 样本 ${index + 1}`,
  gold_labels: {
    company: '字节跳动', position: '运维开发实习生', location: '北京', position_type: '实习', is_intern: true,
    major_requirements: '计算机相关专业', apply_link: null, deadline: '2026-12-31', deadline_raw: null,
  },
  source_internship_id: null,
}));

const db = createMemoryDb({
  internships,
  raw_contents: rawContents,
  applications,
  sample_sets: [{
    id: sampleSetId, name: '本地演示样本_20261114_1800', source_type: '人工全量标注',
    samples: JSON.stringify(samples), created_at: iso(600),
  }],
  experiments: [],
  experiment_results: [],
  prompt_versions: [],
});

const fakeLlm = async ({ model }) => ({
  data: {
    company: '字节跳动', position: '运维开发实习生', location: '北京', position_type: '实习',
    is_intern: true, major_requirements: '计算机相关专业', apply_link: null,
    deadline: '2026-12-31', deadline_raw: null,
    direction: '技术', industry: '互联网/软件', company_nature: '民企', confidence: 0.9,
  },
  usage: { prompt_tokens: 120, completion_tokens: 60 },
});

const handle = application({ db, llm: fakeLlm });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname.startsWith('/functions/v1/app')) {
    const body = await readBody(req);
    const headers = { ...req.headers };
    const request = new Request(`http://127.0.0.1:${PORT}${url.pathname}${url.search}`, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });
    const response = await handle({ request, user: null, requestId: 'local' });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = normalize(join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  } catch {
    try {
      const html = await readFile(join(ROOT, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(html);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`InternRadar dev preview: http://127.0.0.1:${PORT}`);
});
