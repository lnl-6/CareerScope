const BASE = "https://careerscope-tb8isknpdbc.qoder.zone/functions/v1/app";
const PAGE_SIZE = 60;

async function fetchPage(page) {
  const res = await fetch(`${BASE}/api/jobs?type=all&pageSize=${PAGE_SIZE}&page=${page}`);
  if (!res.ok) throw new Error(`page ${page}: ${res.status}`);
  return res.json();
}

async function main() {
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

  const rows = [...byId.values()];
  const no = (v) => v === null || v === undefined || v === "";
  const stats = {
    grandTotal: first.grandTotal,
    total: first.total,
    pages,
    fetched: rows.length,
    uniqueIds: byId.size,
    nulls: {
      direction: rows.filter((r) => no(r.direction)).length,
      industry: rows.filter((r) => no(r.industry)).length,
      publishedAt: rows.filter((r) => no(r.publishedAt)).length,
      companyNature: rows.filter((r) => no(r.companyNature)).length,
      location: rows.filter((r) => no(r.location)).length,
      applyLink: rows.filter((r) => no(r.applyLink)).length,
    },
    industrySource: {},
    positionType: {},
    multiCity: rows.filter((r) => (r.cities || []).length > 1).length,
    noCity: rows.filter((r) => !(r.cities || []).length).length,
    directionTop: {},
    industryTop: {},
    edu: [],
  };
  for (const row of rows) {
    stats.industrySource[row.industrySource || "null"] = (stats.industrySource[row.industrySource || "null"] || 0) + 1;
    stats.positionType[row.positionType || "null"] = (stats.positionType[row.positionType || "null"] || 0) + 1;
    if (row.direction) stats.directionTop[row.direction] = (stats.directionTop[row.direction] || 0) + 1;
    if (row.industry) stats.industryTop[row.industry] = (stats.industryTop[row.industry] || 0) + 1;
    if (row.industry === "教育培训") {
      stats.edu.push({ id: row.id, company: row.company, position: row.position, direction: row.direction, industrySource: row.industrySource });
    }
  }
  stats.directionTop = Object.entries(stats.directionTop).sort((a, b) => b[1] - a[1]);
  stats.industryTop = Object.entries(stats.industryTop).sort((a, b) => b[1] - a[1]);
  stats.eduCount = stats.edu.length;
  stats.edu = stats.edu.slice(0, 25);

  const index = Math.floor(rows.length / 30);
  stats.sample = Array.from({ length: 30 }, (_, i) => {
    const row = rows[i * index];
    return {
      company: row.company,
      position: row.position,
      location: row.location,
      direction: row.direction,
      industry: row.industry,
      industrySource: row.industrySource,
      positionType: row.positionType,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
    };
  });

  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
