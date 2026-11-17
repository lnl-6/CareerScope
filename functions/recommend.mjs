// 规则式企业推荐：按方向/行业/地点过滤确认岗位，再按岗位数、截止临近度、置信度与更新活跃度排序。
function dayDiff(deadline, today) {
  if (!deadline) return null;
  const target = Date.parse(`${deadline}T00:00:00Z`);
  if (Number.isNaN(target)) return null;
  return Math.round((target - today) / 86400000);
}

function daysSince(iso, now) {
  const value = Date.parse(iso || '');
  if (Number.isNaN(value)) return 9999;
  return Math.max(0, Math.round((now - value) / 86400000));
}

export function recommendCompanies(internships, {
  direction = '', industry = '', location = '', limit = 8,
} = {}) {
  const confirmed = internships.filter((item) => item.status === 'confirmed'
    && String(item.company || '').trim()
    && (!direction || item.direction === direction)
    && (!industry || item.industry === industry)
    && (!location || (item.location || '').includes(location)));

  const groups = new Map();
  for (const item of confirmed) {
    if (!groups.has(item.company)) groups.set(item.company, []);
    groups.get(item.company).push(item);
  }

  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const now = Date.now();
  const companies = [];
  for (const [company, jobs] of groups) {
    const sorted = [...jobs].sort((a, b) => {
      const left = a.deadline || '9999-12-31';
      const right = b.deadline || '9999-12-31';
      if (left !== right) return left < right ? -1 : 1;
      return String(b.updated_at).localeCompare(String(a.updated_at));
    });
    const deadlines = sorted.map((job) => job.deadline).filter(Boolean);
    const upcoming = deadlines.filter((value) => (dayDiff(value, today) ?? -1) >= 0);
    const pool = upcoming.length ? upcoming : deadlines;
    const nearest = pool.length ? pool.reduce((min, value) => (value < min ? value : min)) : null;
    const remaining = dayDiff(nearest, today);
    const avgConfidence = jobs.reduce((sum, job) => sum + (Number(job.confidence) || 0), 0) / jobs.length;
    const latest = jobs.reduce((max, job) => (String(job.updated_at) > max ? String(job.updated_at) : max), '');
    const recentDays = daysSince(latest, now);
    const multiSource = jobs.some((job) => (job.additional_sources || []).length > 0);

    const countScore = (Math.min(jobs.length, 5) / 5) * 35;
    const urgencyScore = remaining === null ? 4
      : remaining < 0 ? 0
        : remaining <= 7 ? 25
          : remaining <= 30 ? 18
            : 8;
    const confidenceScore = avgConfidence * 15;
    const recencyScore = recentDays <= 7 ? 15 : recentDays <= 30 ? 10 : 5;
    const score = Math.round(countScore + urgencyScore + confidenceScore + recencyScore + (multiSource ? 10 : 0));

    const reasons = [`${jobs.length} 个匹配岗位`];
    if (nearest) {
      reasons.push(remaining !== null && remaining >= 0
        ? `最近截止 ${nearest}（剩 ${remaining} 天）`
        : `最近截止 ${nearest}`);
    }
    reasons.push(`平均置信度 ${Math.round(avgConfidence * 100)}%`);
    if (recentDays <= 7) reasons.push('近 7 天有更新');
    if (multiSource) reasons.push('多来源可交叉验证');
    const industryValues = [...new Set(jobs.map((job) => job.industry).filter(Boolean))];
    if (industryValues.length) reasons.push(`行业：${industryValues.join(' / ')}`);

    companies.push({
      company,
      score,
      jobCount: jobs.length,
      directions: [...new Set(jobs.map((job) => job.direction).filter(Boolean))],
      industries: industryValues,
      companyNature: jobs.find((job) => job.company_nature)?.company_nature || null,
      nearestDeadline: nearest,
      avgConfidence: Number(avgConfidence.toFixed(2)),
      reasons,
      jobs: sorted.slice(0, 3).map((job) => ({
        id: job.id,
        position: job.position,
        location: job.location,
        deadline: job.deadline,
        direction: job.direction,
        industry: job.industry,
        applyLink: job.apply_link,
      })),
    });
  }

  companies.sort((a, b) => b.score - a.score || b.jobCount - a.jobCount || a.company.localeCompare(b.company, 'zh-CN'));
  return {
    filters: { direction, industry, location },
    totalJobs: confirmed.length,
    totalCompanies: companies.length,
    companies: companies.slice(0, Math.max(1, Math.min(20, Number(limit) || 8))),
  };
}
