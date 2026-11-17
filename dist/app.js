"use strict";

const API_BASE = "/functions/v1/app";
const FIELD_ORDER = [
  "company", "position", "location", "position_type", "is_intern",
  "major_requirements", "apply_link", "deadline", "deadline_raw",
];
const TRIGGER_LABELS = {
  auto_accumulated_samples: "自动积累样本",
  manual_edit: "人工编辑",
};
const DEFAULT_DIRECTION_GROUPS = ["技术与数据"];
const NATURE_OPTIONS = ["民企", "国企", "外企", "上市公司", "事业单位", "未标注"];
const ADMIN_PATH = /^\/admin(?:\.html)?\/?$/.test(window.location.pathname);

const state = {
  view: "explore",
  isAdmin: ADMIN_PATH || new URLSearchParams(window.location.search).get("admin") === "1",
  board: null,
  meta: null,
  directions: new Set(),
  industries: new Set(),
  locations: new Set(),
  natures: new Set(),
  deadline: "",
  metaSignature: "",
  running: new Set(),
  detailId: null,
  detail: null,
  lastNotice: "",
  criteria: {
    directionGroups: new Set(DEFAULT_DIRECTION_GROUPS),
    directions: new Set(),
    industries: new Set(),
    natures: new Set(),
    majors: new Set(),
    majorText: "",
    city: "",
    positionKeywords: [],
    publishedWithinDays: 7,
    openOnly: true,
  },
  favorites: new Set(),
  favoriteJobs: {},
  favoriteApps: new Map(),
  favoritesSynced: false,
  favBusy: new Set(),
  explore: null,
  exploreError: "",
  exploreGroupFallback: false,
  exploreLoading: false,
  exploreSearch: "",
  explorePage: 1,
  jobType: "intern",
  jobIndex: new Map(),
  tracking: null,
  appliedJobs: new Map(),
  trackingLoading: false,
  manualEditing: null,
  adminAuthed: false,
  pick: null,
  reco: null,
  recoSeq: 0,
  boardLimits: { to_apply: 12, applied: 12 },
  collect: null,
  collectNotice: "",
  collecting: false,
  collectCancel: false,
  collectStep: "",
  collectPercent: 0,
  collectSummary: "",
  collectLog: [],
  collectFailures: [],
  collectSourcesSelected: new Set(),
  collectSourcesTouched: false,
  sourceTab: "official",
  sourcePreview: null,
  discovering: false,
  parsing: false,
  reparseRunning: false,
  reparseCancel: false,
  llmTesting: false,
};

const today = new Date();
today.setHours(0, 0, 0, 0);

const els = {
  appShell: document.getElementById("app-shell"),
  sidebar: document.getElementById("sidebar"),
  tabbar: document.getElementById("tabbar"),
  topbarTitle: document.getElementById("topbar-title"),
  topbarView: document.getElementById("topbar-view"),
  mobileFilterToggle: document.getElementById("mobile-filter-toggle"),
  filterBackdrop: document.getElementById("filter-backdrop"),
  filterClose: document.getElementById("filter-close"),
  meDeviceId: document.getElementById("me-device-id"),
  meExportFavorites: document.getElementById("me-export-favorites"),
  meOpenBoard: document.getElementById("me-open-board"),
  meNotice: document.getElementById("me-notice"),
  adminAuthForm: document.getElementById("admin-auth-form"),
  adminToken: document.getElementById("admin-token"),
  adminAuthSubmit: document.getElementById("admin-auth-submit"),
  adminAuthNotice: document.getElementById("admin-auth-notice"),
  boardUpdated: document.getElementById("board-updated"),
  boardLoading: document.getElementById("board-loading"),
  collectLoading: document.getElementById("collect-loading"),
  notice: document.getElementById("notice"),
  count: document.getElementById("count"),
  exportButton: document.getElementById("export"),
  refreshBoard: document.getElementById("refresh-board"),
  stateBox: document.getElementById("state"),
  tooltip: document.getElementById("tooltip"),
  experimentNotice: document.getElementById("experiment-notice"),
  experimentList: document.getElementById("experiment-list"),
  detailPanel: document.getElementById("experiment-detail-panel"),
  detailTitle: document.getElementById("experiment-detail-title"),
  detail: document.getElementById("experiment-detail"),
  promptRows: document.getElementById("prompt-rows"),
  sampleForm: document.getElementById("sample-form"),
  experimentForm: document.getElementById("experiment-form"),
  experimentQuota: document.getElementById("experiment-quota"),
  sampleSetSelect: document.getElementById("experiment-sample-set"),
  kindSelect: document.getElementById("experiment-kind"),
  modelField: document.getElementById("model-field"),
  promptField: document.getElementById("prompt-field"),
  modelsBox: document.getElementById("experiment-models"),
  oldVersionSelect: document.getElementById("experiment-old-version"),
  newVersionSelect: document.getElementById("experiment-new-version"),
  temperature: document.getElementById("experiment-temperature"),
  maxTokens: document.getElementById("experiment-max-tokens"),
  exploreNotice: document.getElementById("explore-notice"),
  exploreSummary: document.getElementById("explore-summary"),
  filterToggle: document.getElementById("filter-toggle"),
  filterClear: document.getElementById("filter-clear"),
  exploreCards: document.getElementById("explore-cards"),
  exploreCriteriaSummary: document.getElementById("explore-criteria-summary"),
  exploreNext: document.getElementById("explore-next"),
  exploreResultsSummary: document.getElementById("explore-results-summary"),
  exploreSearch: document.getElementById("explore-search"),
  exploreJobs: document.getElementById("explore-jobs"),
  exploreMore: document.getElementById("explore-more"),
  exploreSentinel: document.getElementById("explore-sentinel"),
  backToTop: document.getElementById("back-to-top"),
  exploreHero: document.getElementById("explore-hero"),
  jobTypeTabs: document.getElementById("job-type-tabs"),
  trackingNotice: document.getElementById("tracking-notice"),
  trackingLoading: document.getElementById("tracking-loading"),
  trackingEmpty: document.getElementById("tracking-empty"),
  trackingActiveCount: document.getElementById("tracking-active-count"),
  trackingClosedCount: document.getElementById("tracking-closed-count"),
  trackingActiveList: document.getElementById("tracking-active-list"),
  trackingClosedList: document.getElementById("tracking-closed-list"),
  trackingExport: document.getElementById("tracking-export"),
  trackingNext: document.getElementById("tracking-next"),
  trackingManualAdd: document.getElementById("tracking-manual-add"),
  manualModal: document.getElementById("manual-modal"),
  manualForm: document.getElementById("manual-form"),
  manualTitle: document.getElementById("manual-title"),
  manualClose: document.getElementById("manual-close"),
  manualPosition: document.getElementById("manual-position"),
  manualCompany: document.getElementById("manual-company"),
  manualUrl: document.getElementById("manual-url"),
  manualStatus: document.getElementById("manual-status"),
  manualNotes: document.getElementById("manual-notes"),
  manualNotice: document.getElementById("manual-notice"),
  manualSubmit: document.getElementById("manual-submit"),
  manualCancel: document.getElementById("manual-cancel"),
  favoritesSummary: document.getElementById("favorites-summary"),
  favoritesHint: document.getElementById("favorites-hint"),
  favoritesList: document.getElementById("favorites-list"),
  favoritesExport: document.getElementById("favorites-export"),
  pickModal: document.getElementById("pick-modal"),
  pickTitle: document.getElementById("pick-title"),
  pickClose: document.getElementById("pick-close"),
  pickSearch: document.getElementById("pick-search"),
  pickBody: document.getElementById("pick-body"),
  pickExtra: document.getElementById("pick-extra"),
  pickClear: document.getElementById("pick-clear"),
  pickCancel: document.getElementById("pick-cancel"),
  pickConfirm: document.getElementById("pick-confirm"),
  boardDeadline: document.getElementById("deadline"),
  recoSummary: document.getElementById("reco-summary"),
  recoCompanies: document.getElementById("reco-companies"),
  recoJobs: document.getElementById("reco-jobs"),
  toApplyList: document.getElementById("to-apply-list"),
  appliedList: document.getElementById("applied-list"),
  toApplyCount: document.getElementById("to-apply-count"),
  appliedCount: document.getElementById("applied-count"),
  collectNoticeBox: document.getElementById("collect-notice"),
  collectLlm: document.getElementById("collect-llm"),
  collectConfirmed: document.getElementById("collect-confirmed"),
  reparseBar: document.getElementById("reparse-bar"),
  reparseText: document.getElementById("reparse-text"),
  collectReparse: document.getElementById("collect-reparse"),
  collectProgress: document.getElementById("collect-progress"),
  collectBar: document.getElementById("collect-bar"),
  collectStep: document.getElementById("collect-step"),
  collectCancel: document.getElementById("collect-cancel"),
  collectSummary: document.getElementById("collect-summary"),
  collectLog: document.getElementById("collect-log"),
  collectRetry: document.getElementById("collect-retry"),
  collectSourcesSummary: document.getElementById("collect-sources-summary"),
  sourceTabs: document.getElementById("source-tabs"),
  sourceAddPublic: document.getElementById("source-add-public"),
  collectSources: document.getElementById("collect-sources"),
  collectTarget: document.getElementById("collect-target"),
  collectRun: document.getElementById("collect-run"),
  collectEstimate: document.getElementById("collect-estimate"),
  collectModel: document.getElementById("collect-model"),
  llmTest: document.getElementById("llm-test"),
  collectNext: document.getElementById("collect-next"),
  sourceUrl: document.getElementById("source-url"),
  sourceDiscover: document.getElementById("source-discover"),
  sourceAdd: document.getElementById("source-add"),
  sourcePreview: document.getElementById("source-preview"),
};

// ---- 本地偏好：条件、看板筛选与收藏 ----

const STORAGE_KEYS = {
  criteria: "internradar.criteria.v1",
  favorites: "internradar.favorites.v1",
  favoriteJobs: "internradar.favoriteJobs.v1",
  device: "internradar.device.v1",
  adminToken: "internradar.adminToken.v1",
};

function readStoredJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 隐私模式或存储已满时静默降级为仅本次会话有效
  }
}

function textList(value, max = 20) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === "string" && item.length <= 120))].slice(0, max)
    : [];
}

const URL_CRITERIA_KEYS = ["direction", "directionGroup", "industry", "nature", "location", "q", "type"];

function splitUrlList(value) {
  return String(value || "").split(/[,，、;；]+/).map((item) => item.trim()).filter(Boolean);
}

function hydrateCriteria() {
  const stored = readStoredJson(STORAGE_KEYS.criteria);
  if (!stored || typeof stored !== "object") return;
  const explore = stored.explore && typeof stored.explore === "object" ? stored.explore : {};
  const criteria = state.criteria;
  const storedGroups = explore.directionGroups ?? stored.directionGroups;
  criteria.directionGroups = new Set(
    Array.isArray(storedGroups) ? textList(storedGroups, 3) : DEFAULT_DIRECTION_GROUPS,
  );
  criteria.directions = new Set(textList(explore.directions ?? stored.directions));
  criteria.industries = new Set(textList(explore.industries ?? stored.industries));
  criteria.natures = new Set(textList(explore.natures ?? stored.natures, 4));
  const storedLocations = textList(explore.locations);
  criteria.city = typeof stored.city === "string" ? stored.city.slice(0, 30) : (storedLocations[0] || "");
  const type = String(explore.jobType || stored.jobType || "");
  if (["intern", "campus"].includes(type)) state.jobType = type;
  const q = String(explore.q ?? stored.q ?? "").trim().slice(0, 80);
  if (q) state.exploreSearch = q;
  if (q && els.exploreSearch) els.exploreSearch.value = q;
}

function hydrateCriteriaFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (!URL_CRITERIA_KEYS.some((key) => params.has(key))) {
    syncCriteriaToUrl();
    return;
  }
  const criteria = state.criteria;
  criteria.directionGroups = new Set(textList(splitUrlList(params.get("directionGroup")), 3));
  criteria.directions = new Set(textList(splitUrlList(params.get("direction"))));
  criteria.industries = new Set(textList(splitUrlList(params.get("industry"))));
  criteria.natures = new Set(textList(splitUrlList(params.get("nature")), 4));
  criteria.city = String(params.get("location") || "").trim().slice(0, 30);
  const type = String(params.get("type") || "");
  if (["intern", "campus"].includes(type)) state.jobType = type;
  const q = String(params.get("q") || "").trim().slice(0, 80);
  state.exploreSearch = q;
  if (els.exploreSearch) els.exploreSearch.value = q;
  saveCriteria();
}

function syncCriteriaToUrl() {
  const criteria = state.criteria;
  const params = new URLSearchParams(window.location.search);
  const setOrDelete = (key, value) => {
    if (value) params.set(key, value);
    else params.delete(key);
  };
  ["major", "keywords", "publishedWithin", "openOnly"].forEach((key) => params.delete(key));
  setOrDelete("directionGroup", [...criteria.directionGroups].join(","));
  setOrDelete("direction", [...criteria.directions].join(","));
  setOrDelete("industry", [...criteria.industries].join(","));
  setOrDelete("nature", [...criteria.natures].join(","));
  setOrDelete("location", criteria.city);
  setOrDelete("q", state.exploreSearch.trim());
  setOrDelete("type", state.jobType === "intern" ? "" : state.jobType);
  const search = params.toString();
  const next = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) window.history.replaceState(null, "", next);
}

function saveCriteria() {
  const criteria = state.criteria;
  writeStoredJson(STORAGE_KEYS.criteria, {
    directionGroups: [...criteria.directionGroups],
    directions: [...criteria.directions],
    industries: [...criteria.industries],
    natures: [...criteria.natures],
    city: criteria.city,
    jobType: state.jobType,
    q: state.exploreSearch,
    explore: {
      directionGroups: [...criteria.directionGroups],
      directions: [...criteria.directions],
      locations: criteria.city ? [criteria.city] : [],
      industries: [...criteria.industries],
      natures: [...criteria.natures],
      jobType: state.jobType,
      q: state.exploreSearch,
    },
  });
  syncCriteriaToUrl();
}

function hydrateFavorites() {
  state.favorites = new Set(textList(readStoredJson(STORAGE_KEYS.favorites), 500));
  const stored = readStoredJson(STORAGE_KEYS.favoriteJobs);
  state.favoriteJobs = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
}

function saveFavorites() {
  writeStoredJson(STORAGE_KEYS.favorites, [...state.favorites]);
  writeStoredJson(STORAGE_KEYS.favoriteJobs, state.favoriteJobs);
}

function getDeviceId() {
  if (state.deviceId) return state.deviceId;
  let value = "";
  try {
    value = String(window.localStorage.getItem(STORAGE_KEYS.device) || "").trim();
  } catch {
    value = "";
  }
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(value)) {
    value = window.crypto?.randomUUID?.() || `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    try {
      window.localStorage.setItem(STORAGE_KEYS.device, value);
    } catch {
      // 存储不可用时仅本次会话保留设备标识
    }
  }
  state.deviceId = value;
  return value;
}

function jobKey(job) {
  const link = String(job.applyLink || job.sourceUrl || "").trim();
  if (link) return `link:${link}`;
  return `job:${job.company || ""}|${job.position || ""}|${job.location || ""}`;
}

function isFavorite(job) {
  return state.favorites.has(jobKey(job));
}

function favoriteSnapshot(job) {
  if (!job) return null;
  const keys = [
    "id", "company", "position", "location", "cities", "positionType", "isIntern",
    "majorRequirements", "deadline", "deadlineRaw", "pay", "salary", "publishedAt",
    "applyLink", "linkKind", "direction", "industry", "companyNature", "sourceName", "sourceUrl",
  ];
  return Object.fromEntries(keys.filter((key) => job[key] !== undefined).map((key) => [key, job[key]]));
}

function noticeForView(message) {
  if (state.view === "board") trackingNotice(message);
  else exploreNotice(message);
}

function mergeFavoriteRows(rows) {
  const allRows = Array.isArray(rows) ? rows : [];
  const savedRows = allRows.filter((row) => row.status === "saved");
  const trackedIds = new Set(allRows.filter((row) => row.id).map((row) => row.id));
  const favorites = new Set();
  const jobs = {};
  const apps = new Map();
  for (const row of savedRows) {
    const snapshot = favoriteSnapshot(row);
    if (!snapshot?.id) continue;
    const key = jobKey(row);
    favorites.add(key);
    jobs[key] = snapshot;
    apps.set(row.id, row.applicationId);
  }
  for (const key of state.favorites) {
    const snapshot = state.favoriteJobs[key];
    if (!snapshot) continue;
    if (!snapshot.id) {
      favorites.add(key);
      jobs[key] = snapshot;
      continue;
    }
    if (trackedIds.has(snapshot.id)) continue;
    if (!isTrackableJob(snapshot)) continue;
    favorites.add(key);
    jobs[key] = snapshot;
  }
  state.favorites = favorites;
  state.favoriteJobs = jobs;
  state.favoriteApps = apps;
}

async function syncFavoritesFromServer() {
  let rows;
  try {
    const data = await api(`/api/tracking?deviceId=${encodeURIComponent(getDeviceId())}`);
    rows = data.rows || [];
  } catch {
    return;
  }
  indexAppliedRows(rows);
  const savedIds = new Set(rows.filter((row) => row.status === "saved").map((row) => row.id));
  const pending = [...state.favorites]
    .map((key) => state.favoriteJobs[key])
    .filter((snapshot) => snapshot?.id && !savedIds.has(snapshot.id) && isTrackableJob(snapshot));
  let migrated = 0;
  for (const snapshot of pending) {
    try {
      const res = await api("/api/tracking", {
        method: "POST",
        body: { deviceId: getDeviceId(), jobId: snapshot.id, status: "saved" },
      });
      if (res.application?.status === "saved") migrated += 1;
    } catch {
      // 迁移失败时保留本机收藏，不阻塞页面
    }
  }
  if (migrated) {
    try {
      const data = await api(`/api/tracking?deviceId=${encodeURIComponent(getDeviceId())}`);
      rows = data.rows || rows;
      indexAppliedRows(rows);
    } catch {
      // 保留迁移前的行，本机收藏仍可展示
    }
  }
  mergeFavoriteRows(rows);
  state.favoritesSynced = true;
  saveFavorites();
  renderFavoritesList();
  if (state.view === "explore" && state.explore) renderExploreResults();
  if (state.tracking) renderTracking();
}

async function toggleFavorite(key) {
  if (!key || state.favBusy.has(key)) return;
  const job = state.jobIndex.get(key) || state.favoriteJobs[key];
  if (!job) return;
  const fav = state.favorites.has(key);
  if (!fav) {
    if (!job.id) {
      noticeForView("该岗位缺少标识，暂时无法收藏。");
      return;
    }
    if (!isTrackableJob(job)) {
      noticeForView("该岗位没有独立详情页，暂不支持收藏跟踪。");
      return;
    }
  }
  state.favBusy.add(key);
  try {
    if (fav) {
      const appId = (job.id && state.favoriteApps.get(job.id))
        || state.tracking?.rows?.find((row) => row.id === job.id && row.status === "saved")?.applicationId
        || null;
      if (appId) {
        await api(`/api/tracking/${appId}?deviceId=${encodeURIComponent(getDeviceId())}`, { method: "DELETE" });
      }
      state.favorites.delete(key);
      delete state.favoriteJobs[key];
      if (job.id) state.favoriteApps.delete(job.id);
      saveFavorites();
      noticeForView("已取消收藏。");
    } else {
      const res = await api("/api/tracking", {
        method: "POST",
        body: { deviceId: getDeviceId(), jobId: job.id, status: "saved" },
      });
      const application = res.application;
      if (application?.status !== "saved") {
        noticeForView("该岗位已在投递记录中，无需再收藏。");
      } else if (!application?.applicationId) {
        noticeForView("收藏记录已创建，但缺少记录标识，请刷新页面重试。");
      } else {
        state.favorites.add(key);
        state.favoriteJobs[key] = favoriteSnapshot(job);
        state.favoriteApps.set(job.id, application.applicationId);
        saveFavorites();
        noticeForView("已收藏，可在「投递追踪」查看。");
      }
    }
  } catch (error) {
    noticeForView(error.message || "收藏操作失败，请稍后重试。");
  } finally {
    state.favBusy.delete(key);
  }
  renderFavoritesList();
  if (state.view === "explore" && state.explore) renderExploreResults();
  else if (state.view === "board" && state.tracking) renderTracking();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatNumber(value, digits) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toFixed(digits);
}



function deadlineMatches(deadline, bucket) {
  if (bucket === "无截止") {
    return !deadline;
  }
  if (!deadline) {
    return false;
  }
  const due = new Date(`${deadline}T00:00:00`);
  if (Number.isNaN(due.getTime())) {
    return false;
  }
  const days = Math.round((due - today) / 86400000);
  if (days < 0) {
    return false;
  }
  if (bucket === "7 天内") {
    return days <= 7;
  }
  if (bucket === "30 天内") {
    return days > 7 && days <= 30;
  }
  return days > 30;
}

function matches(row) {
  if (state.directions.size && !state.directions.has(row.direction || "其他")) {
    return false;
  }
  if (state.industries.size && !state.industries.has(row.industry || "其他")) {
    return false;
  }
  if (state.locations.size) {
    const location = (row.location || "").toLowerCase();
    const hit = [...state.locations].some((keyword) => location.includes(keyword.toLowerCase()));
    if (!hit) {
      return false;
    }
  }
  if (state.natures.size && !state.natures.has(row.companyNature || "")) {
    return false;
  }
  if (state.deadline && !deadlineMatches(row.deadline, state.deadline)) {
    return false;
  }
  return true;
}

function adminTokenValue() {
  try {
    return String(window.sessionStorage.getItem(STORAGE_KEYS.adminToken) || "").trim();
  } catch {
    return "";
  }
}

async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (path.startsWith("/api/admin") || path.startsWith("/api/experiments") || path.startsWith("/api/sample-sets")) {
    const token = adminTokenValue();
    if (token) headers["x-admin-token"] = token;
  }
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new Error("网络连接失败，请检查网络后重试。");
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error(data?.error?.message || "操作失败，请稍后重试。");
    error.code = data?.error?.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

// ---- 视图切换与侧边栏 ----

const VIEW_TITLES = {
  explore: "岗位",
  collect: "数据采集",
  board: "投递追踪",
  experiments: "解析实验",
  me: "我的",
};
const ADMIN_VIEWS = new Set(["collect", "experiments"]);
const ADMIN_NAV = [
  {
    view: "collect",
    label: "数据采集",
    short: "采集",
    icon: '<path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z"></path><path d="M4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7"></path><path d="M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5"></path>',
  },
  {
    view: "experiments",
    label: "解析实验",
    short: "实验",
    icon: '<path d="M9 3h6"></path><path d="M10 3v5l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 17l-5-9V3"></path><path d="M7.5 15h9"></path>',
  },
];

function setLoading(element, active) {
  if (!element) return;
  element.hidden = !active;
}



function navIcon(path, className) {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

function ensureAdminEntries() {
  if (!state.isAdmin) return;
  const nav = document.getElementById("sidebar-nav");
  ADMIN_NAV.forEach((entry) => {
    if (nav.querySelector(`[data-view="${entry.view}"]`)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-item";
    button.dataset.view = entry.view;
    button.dataset.active = "false";
    button.innerHTML = `${navIcon(entry.icon, "nav-icon")}<span class="nav-label">${entry.label}</span>`;
    button.addEventListener("click", () => switchView(entry.view));
    nav.append(button);

    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab-item";
    tab.dataset.view = entry.view;
    tab.dataset.active = "false";
    tab.setAttribute("aria-selected", "false");
    tab.innerHTML = `${navIcon(entry.icon, "tab-icon")}<span class="tab-label">${entry.short}</span>`;
    tab.addEventListener("click", () => switchView(entry.view));
    els.tabbar.append(tab);
  });
}

function switchView(view, { scroll = true } = {}) {
  if (!VIEW_TITLES[view]) return;
  if (!state.isAdmin && ADMIN_VIEWS.has(view)) view = "explore";
  if (ADMIN_VIEWS.has(view) && !state.adminAuthed) {
    showAdminAuth();
    return;
  }
  state.view = view;
  document.querySelectorAll(".view").forEach((section) => {
    section.hidden = section.id !== `view-${view}`;
  });
  document.querySelectorAll(".nav-item[data-view], .tab-item[data-view]").forEach((item) => {
    const active = item.dataset.view === view;
    item.classList.toggle("is-active", active);
    item.dataset.active = String(active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
    if (item.classList.contains("tab-item")) item.setAttribute("aria-selected", String(active));
  });
  els.topbarView.textContent = VIEW_TITLES[view];
  document.title = `${VIEW_TITLES[view]} · 职途罗盘 CareerScope`;
  setFiltersOpen(false);
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  if (view === "explore") loadExplore();
  else if (view === "collect") {
    loadCollect();
    loadMeta();
  } else if (view === "board") loadTracking();
  else if (view === "me") loadMe();
  else loadMeta();
  updateBackToTop();
}

document.querySelectorAll(".nav-item[data-view], .tab-item[data-view]").forEach((item) => {
  item.addEventListener("click", () => switchView(item.dataset.view));
});

function setFiltersOpen(open) {
  const active = Boolean(open);
  const panel = document.getElementById("explore-criteria-panel");
  document.body.classList.toggle("filters-open", active);
  if (panel) panel.hidden = !active;
  els.filterToggle?.setAttribute("aria-expanded", String(active));
  els.mobileFilterToggle?.setAttribute("aria-expanded", String(active));
  if (els.filterBackdrop) {
    const mobile = window.matchMedia("(max-width: 899px)").matches;
    els.filterBackdrop.hidden = !active || !mobile;
  }
}

els.filterToggle?.addEventListener("click", () => {
  const panel = document.getElementById("explore-criteria-panel");
  setFiltersOpen(Boolean(panel?.hidden));
});
els.mobileFilterToggle?.addEventListener("click", () => setFiltersOpen(true));
els.filterBackdrop?.addEventListener("click", () => setFiltersOpen(false));
els.filterClose?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  setFiltersOpen(false);
});
els.filterClear?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  resetExploreCriteria();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setFiltersOpen(false);
});
els.meExportFavorites?.addEventListener("click", exportFavoritesJson);
els.meOpenBoard?.addEventListener("click", () => switchView("board"));
// ---- 岗位卡片与投递追踪 ----









function formatRelativePublish(value) {
  const ts = Date.parse(value || "");
  if (Number.isNaN(ts)) return "";
  const diff = Date.now() - ts;
  if (diff < 0) return "刚刚";
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "今天";
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

function formatMonthDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) return "";
  return `${Number(match[2])}月${Number(match[3])}日`;
}

function formatAppliedDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) return "";
  return `${match[2]}/${match[3]}`;
}

const JOB_CODE_RE = /[（(]\s*[A-Za-z]{1,4}\d{4,}\s*[）)]/g;

function cleanTitle(title) {
  let text = String(title || "").trim();
  if (!text) return "";
  text = text.replace(JOB_CODE_RE, " ")
    .replace(/^【[^】]*】\s*/, "")
    .replace(/^\[[^\]]*\]\s*/, "")
    .replace(/^岗位[:：]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.split(/[|｜]/)[0].trim();
}

function jobTitle(job) {
  return cleanTitle(job?.position) || "未命名岗位";
}

const PROVINCE_NAMES = new Set([
  "北京", "天津", "河北", "山西", "内蒙古", "辽宁", "吉林", "黑龙江",
  "上海", "江苏", "浙江", "安徽", "福建", "江西", "山东", "河南",
  "湖北", "湖南", "广东", "广西", "海南", "重庆", "四川", "贵州",
  "云南", "西藏", "陕西", "甘肃", "青海", "宁夏", "新疆", "台湾",
  "香港", "澳门",
]);
const MUNICIPALITIES = new Set(["北京", "天津", "上海", "重庆"]);

function displayCity(cities) {
  const raw = (Array.isArray(cities) ? cities : [cities])
    .flatMap((value) => String(value || "").split(/[\/、，,;；|]+/))
    .map((value) => value.trim())
    .filter(Boolean);
  const values = [...new Set(raw)];
  const hasCity = values.some((value) => !PROVINCE_NAMES.has(value) || MUNICIPALITIES.has(value));
  if (!hasCity) return values;
  return values.filter((value) => !PROVINCE_NAMES.has(value) || MUNICIPALITIES.has(value));
}

function jobCityList(job) {
  const cities = Array.isArray(job?.cities) ? job.cities.filter(Boolean) : [];
  return displayCity(cities.length ? cities : [job?.location]);
}

function cityTags(job) {
  const values = jobCityList(job);
  if (!values.length) return "";
  const shown = values.slice(0, 2);
  const extra = values.length - shown.length;
  return shown.map((city) => `<span class="tag tag--city">${escapeHtml(city)}</span>`).join("") +
    (extra > 0 ? `<span class="tag tag--city">+${extra}</span>` : "");
}

function jobTags(job) {
  const direction = String(job.direction || "").trim();
  return [
    direction ? `<span class="tag tag--direction">${escapeHtml(direction)}</span>` : "",
    job.industry ? `<span class="tag tag--industry">${escapeHtml(job.industry)}</span>` : "",
    cityTags(job),
    job.companyNature ? `<span class="tag tag--nature">${escapeHtml(job.companyNature)}</span>` : "",
  ].filter(Boolean).join("");
}

function deadlineInfo(job) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(job.deadline || ""));
  if (!match) {
    return { state: "none", label: "", text: "", days: null };
  }
  const target = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target - today) / 86400000);
  const dayText = formatMonthDay(job.deadline);
  if (days < 0) return { state: "expired", label: "已截止", text: `已截止 ${dayText}`, days };
  if (days === 0) return { state: "soon", label: "即将截止", text: "今天截止", days };
  if (days <= 3) return { state: "soon", label: "即将截止", text: `截止：${dayText}`, days };
  return { state: "open", label: "", text: `截止：${dayText}`, days };
}



function publishInfo(job) {
  const publishedTs = Date.parse(job.publishedAt || "");
  if (Number.isNaN(publishedTs)) return null;
  const relative = formatRelativePublish(job.publishedAt);
  if (!relative) return null;
  const days = Math.max(0, Math.floor((Date.now() - publishedTs) / 86400000));
  return {
    text: `发布于 ${relative}`,
    cls: days <= 1 ? "is-new" : days > 14 ? "is-old" : "",
    isNew: days <= 1,
  };
}



const STATUS_LABELS = {
  to_apply: "待投递",
  applied: "已投递",
  written_exam: "笔试",
  interview: "面试",
  offer: "Offer",
  rejected: "挂掉",
  expired: "已截止",
};
const CLOSED_STATUSES = new Set(["offer", "rejected", "expired"]);

function shortMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  if (number >= 10000 && number % 1000 === 0) return `${number / 1000}K`;
  if (number >= 1000) return `${(number / 1000).toFixed(number % 1000 === 0 ? 0 : 1)}K`;
  return String(Math.round(number));
}

function salaryDisplay(job) {
  const salary = job.salary;
  if (salary?.negotiable) return { text: "💰 面议", unknown: false };
  const raw = String(job.pay || "").trim();
  if (raw && /面议/.test(raw)) return { text: "💰 面议", unknown: false };
  if (salary?.parsed && shortMoney(salary.min)) {
    const range = salary.min === salary.max
      ? shortMoney(salary.min)
      : `${shortMoney(salary.min)}-${shortMoney(salary.max)}`;
    const unit = String(salary.unit || "元/月").replace(/^元/, "").replace(/\s+/g, "");
    return { text: `💰 ${range}${unit}`, unknown: false };
  }
  if (!raw) return { text: "薪资未公开", unknown: true };
  const compact = raw
    .replace(/\s+/g, "")
    .replace(/元\/(天|月|时|年)/g, "/$1")
    .replace(/(\d)元/g, "$1");
  return { text: `💰 ${compact}`, unknown: false };
}

function isTrackableJob(job) {
  if (!job) return false;
  if (job.linkKind) return job.linkKind === "job_detail";
  return /\/job(?:[-_/])/i.test(String(job.applyLink || ""));
}

function appliedState(job) {
  return job?.id ? state.appliedJobs.get(job.id) || null : null;
}

function indexAppliedRows(rows) {
  state.appliedJobs = new Map((rows || [])
    .filter((row) => row?.id)
    .map((row) => [row.id, {
      status: row.status,
      appliedAt: row.appliedAt,
      applicationId: row.applicationId,
    }]));
}

const TRACK_FLOW_STEPS = [
  { key: "applied", label: "已投递" },
  { key: "written_exam", label: "笔试" },
  { key: "interview", label: "面试" },
  { key: "offer", label: "Offer" },
];
const TIMELINE_TERMINALS = { rejected: "挂掉", expired: "已截止" };

function statusTimes(row) {
  const times = new Map();
  for (const entry of Array.isArray(row.statusHistory) ? row.statusHistory : []) {
    if (entry?.status && !times.has(entry.status)) times.set(entry.status, entry.at);
  }
  return times;
}

function renderTrackFlow(row) {
  const times = statusTimes(row);
  const allowed = new Set((row.allowedTransitions || []).map((item) => item.key));
  const currentIndex = TRACK_FLOW_STEPS.findIndex((step) => step.key === row.status);
  const nodes = TRACK_FLOW_STEPS.map((step, index) => {
    const at = times.get(step.key);
    const reached = currentIndex >= 0 ? index <= currentIndex : Boolean(at);
    const current = row.status === step.key;
    const clickable = !reached && allowed.has(step.key);
    const date = at ? String(at).slice(5, 10) : "";
    const cls = ["flow__step", reached ? "flow__step--done" : "",
      current ? "flow__step--current" : "", clickable ? "flow__step--clickable" : ""].filter(Boolean).join(" ");
    const hit = clickable
      ? `<button type="button" class="flow__hit" data-timeline-advance="${escapeHtml(row.applicationId || "")}" data-status="${step.key}" aria-label="推进到${escapeHtml(step.label)}" title="推进到${escapeHtml(step.label)}"></button>`
      : "";
    return `<li class="${cls}">${hit}<span class="flow__dot" aria-hidden="true"></span>` +
      `<span class="flow__label">${escapeHtml(step.label)}</span>` +
      (date ? `<time class="flow__date">${escapeHtml(date)}</time>` : "") +
      `</li>`;
  }).join("");
  const terminalAt = times.get(row.status);
  const terminal = TIMELINE_TERMINALS[row.status]
    ? `<p class="flow__terminal is-${row.status}">${escapeHtml(TIMELINE_TERMINALS[row.status])}` +
      `${terminalAt ? ` <time>${escapeHtml(String(terminalAt).slice(5, 10))}</time>` : ""}</p>`
    : "";
  const menuItems = (row.allowedTransitions || [])
    .filter((item) => item.key === "rejected" || item.key === "expired")
    .map((item) => `<button type="button" class="flow__menu-btn" data-timeline-advance="${escapeHtml(row.applicationId || "")}" data-status="${item.key}">${item.key === "rejected" ? "标记挂掉" : "标记已截止"}</button>`)
    .join("");
  const menu = menuItems
    ? `<details class="flow__more"><summary aria-label="更多状态操作" title="更多状态操作">⋯</summary>` +
      `<div class="flow__menu">${menuItems}</div></details>`
    : "";
  return `<aside class="track-card__flow" aria-label="投递进度">` +
    `<div class="flow__head"><p class="flow__title">投递进度</p>${menu}</div>` +
    `<ol class="flow">${nodes}</ol>${terminal}</aside>`;
}

function renderTrackCard(job) {
  const manual = job.isManual === true;
  const orphaned = job.isOrphaned === true;
  const fav = isFavorite(job);
  const favKey = jobKey(job);
  const publish = publishInfo(job);
  const pay = salaryDisplay(job);
  const trackable = isTrackableJob(job);
  const title = jobTitle(job);
  const tags = manual
    ? `<span class="tag tag--manual">自建</span>`
    : orphaned
      ? `<span class="tag tag--manual">已下线</span>`
      : jobTags(job);
  const applyUrl = safeUrl(job.applyLink) || safeUrl(job.sourceUrl);
  const favButton = manual || orphaned
    ? ""
    : `<button type="button" class="icon-btn${fav ? " is-active" : ""}" data-fav-key="${escapeHtml(favKey)}" aria-pressed="${fav}" aria-label="${fav ? "取消收藏" : "收藏"}" title="${fav ? "取消收藏" : "收藏"}">${fav ? "★" : "☆"}</button>`;
  const applyAction = applyUrl
    ? `<a class="btn" href="${escapeHtml(applyUrl)}" target="_blank" rel="noopener noreferrer">去官网</a>`
    : `<span class="btn btn--disabled" title="该岗位没有可打开的链接">去官网</span>`;
  const sourceWarn = trackable ? "" : ` <span class="source-warn" title="该岗位没有独立详情页，暂不支持投递追踪">⚠</span>`;
  const time = publish
    ? `<time class="track-card__time"${job.publishedAt ? ` datetime="${escapeHtml(job.publishedAt)}"` : ""}>${escapeHtml(publish.text)}</time>`
    : "";
  const removeButton = `<button type="button" class="btn btn--danger-ghost" data-tracking-remove="${escapeHtml(job.applicationId || "")}">移除</button>`;
  const actions = manual
    ? (applyUrl
      ? `<a class="btn" href="${escapeHtml(applyUrl)}" target="_blank" rel="noopener noreferrer">去投递链接</a>`
      : `<span class="btn btn--disabled">无投递链接</span>`) +
      `<button type="button" class="btn" data-manual-edit="${escapeHtml(job.applicationId || "")}">编辑</button>` +
      removeButton
    : orphaned
      ? `<span class="btn btn--disabled">岗位已下线</span>${removeButton}`
      : `${favButton}${applyAction}${removeButton}`;
  const meta = manual || orphaned
    ? `<div class="track-card__meta"><span class="track-card__source">${manual ? "手动添加" : "岗位已下线，保留投递记录"}</span></div>`
    : `<div class="track-card__meta">` +
      `<span class="track-card__salary${pay.unknown ? " track-card__salary--unknown" : ""}">${escapeHtml(pay.text)}</span>` +
      `<span class="track-card__source">来源：${escapeHtml(String(job.sourceName || "").trim() || "公开渠道")}${sourceWarn}</span>` +
      `</div>`;
  const notes = manual && job.notes
    ? `<p class="track-card__notes">${escapeHtml(job.notes)}</p>`
    : "";
  return `<article class="track-card${manual ? " track-card--manual" : ""}">` +
    `<div class="track-card__main">` +
    `<div class="track-card__head"><h3 class="track-card__title">${escapeHtml(title)}</h3>${time}</div>` +
    `<p class="track-card__company">${escapeHtml(job.company || "未识别公司")}</p>` +
    `<div class="track-card__tags">${tags}</div>` +
    meta +
    notes +
    `<div class="track-card__actions">${actions}` +
    `</div></div>` +
    renderTrackFlow(job) +
    `</article>`;
}


function indexJobs(jobs) {
  let favoritesChanged = false;
  for (const job of jobs || []) {
    if (!job?.id) continue;
    const key = jobKey(job);
    state.jobIndex.set(key, job);
    if (state.favorites.has(key) && !state.favoriteJobs[key]) {
      state.favoriteJobs[key] = favoriteSnapshot(job);
      favoritesChanged = true;
    }
  }
  if (favoritesChanged) saveFavorites();
}

function renderJobCard(job) {
  const fav = isFavorite(job);
  const favKey = jobKey(job);
  const deadline = deadlineInfo(job);
  const publish = publishInfo(job);
  const pay = salaryDisplay(job);
  const trackable = isTrackableJob(job);
  const applied = appliedState(job);
  const title = jobTitle(job);
  const tags = jobTags(job);
  const favButton = `<button type="button" class="job-card__fav${fav ? " is-active" : ""}" data-fav-key="${escapeHtml(favKey)}" aria-pressed="${fav}" aria-label="${fav ? "取消收藏" : "收藏"}">${fav ? "★ 已收藏" : "☆ 收藏"}</button>`;
  const applyUrl = safeUrl(job.applyLink) || safeUrl(job.sourceUrl);
  const appliedDone = applied && applied.status !== "saved";
  const applyButton = appliedDone
    ? `<button type="button" class="btn btn--done" disabled>✓ 已投递${applied.appliedAt ? ` ${escapeHtml(formatAppliedDate(applied.appliedAt))}` : ""}</button>`
    : trackable
      ? `<button type="button" class="btn btn--primary" data-apply-job="${escapeHtml(job.id || "")}">投递</button>`
      : applyUrl
        ? `<a class="btn" href="${escapeHtml(applyUrl)}" target="_blank" rel="noopener noreferrer">仅来源页</a>`
        : `<span class="btn btn--disabled">仅来源页</span>`;
  const actions = `<span class="job-card__actions${deadline.state === "none" ? " is-end" : ""}">${favButton}${applyButton}</span>`;
  const deadlineText = deadline.state === "expired"
    ? deadline.text
    : deadline.state === "soon"
      ? (deadline.days === 0 ? "今天截止" : `${deadline.text} · 即将截止`)
      : deadline.text;
  const deadlineClass = deadline.state === "soon" ? " is-soon" : deadline.state === "expired" ? " is-expired" : "";
  const time = publish
    ? `<div class="job-card__time-wrap"><time class="job-card__time">${escapeHtml(publish.text)}</time>${publish.isNew ? `<span class="job-card__new">NEW</span>` : ""}</div>`
    : "";
  return `<article class="job-card${deadline.state === "expired" ? " is-expired" : ""}">` +
    `<div class="job-card__head">` +
    `<h3 class="job-card__title">${escapeHtml(title)}</h3>${time}` +
    `</div>` +
    `<p class="job-card__company">${escapeHtml(job.company || "未识别公司")}</p>` +
    `<div class="job-card__tags">${tags}</div>` +
    `<div class="job-card__foot">` +
    `<span class="job-card__salary${pay.unknown ? " job-card__salary--unknown" : ""}">${escapeHtml(pay.text)}</span>` +
    (deadline.state === "none" ? "" : `<span class="job-card__deadline${deadlineClass}">${escapeHtml(deadlineText)}</span>`) +
    actions +
    `</div>` +
    `</article>`;
}

async function applyToJob(job) {
  if (!job?.id) return;
  if (!isTrackableJob(job)) {
    exploreNotice("该岗位没有独立详情页，暂不支持投递记录。");
    return;
  }
  const popup = window.open("", "_blank");
  if (!popup) {
    exploreNotice("浏览器拦截了新窗口，请允许弹窗后重试。");
    return;
  }
  try {
    popup.document.title = "正在记录投递…";
    popup.document.body.innerHTML = `<p style="font:15px/1.6 sans-serif;padding:32px">正在记录投递，请稍候…</p>`;
  } catch {
    // about:blank 写入失败不影响后续跳转
  }
  try {
    const data = await api("/api/tracking", {
      method: "POST",
      body: { deviceId: getDeviceId(), jobId: job.id, status: "applied" },
    });
    let application = data.application;
    if (application?.status === "saved" && application.applicationId) {
      const patched = await api(`/api/tracking/${application.applicationId}`, {
        method: "PATCH",
        body: { deviceId: getDeviceId(), status: "applied" },
      });
      application = patched.application || application;
    }
    state.appliedJobs.set(job.id, {
      status: application?.status || "applied",
      appliedAt: application?.appliedAt || new Date().toISOString().slice(0, 10),
      applicationId: application?.applicationId,
    });
    if (application?.status !== "saved") {
      const key = jobKey(job);
      state.favorites.delete(key);
      delete state.favoriteJobs[key];
      state.favoriteApps.delete(job.id);
      saveFavorites();
    }
    const target = safeUrl(job.applyLink) || safeUrl(job.sourceUrl);
    if (target) {
      popup.location.href = target;
      exploreNotice("已记录投递，可在「投递」中跟踪进度。");
    } else {
      popup.close();
      exploreNotice("已记录投递，但该岗位没有可打开的投递链接。");
    }
    if (state.view === "explore") renderExploreResults();
    if (state.view === "board") await loadTracking();
    renderFavoritesList();
  } catch (error) {
    try { popup.close(); } catch { /* 弹窗已关闭 */ }
    exploreNotice(error.message || "投递记录失败，请稍后重试。");
  }
}

function trackingNotice(message) {
  els.trackingNotice.hidden = !message;
  els.trackingNotice.textContent = message || "";
}

async function loadTracking() {
  setLoading(els.trackingLoading, true);
  trackingNotice("");
  try {
    const data = await api(`/api/tracking?deviceId=${encodeURIComponent(getDeviceId())}`);
    state.tracking = data;
    indexAppliedRows(data.rows);
    indexJobs(data.rows);
    mergeFavoriteRows(data.rows);
  } catch (error) {
    state.tracking = null;
    trackingNotice(error.message || "投递记录加载失败，请稍后重试。");
  } finally {
    setLoading(els.trackingLoading, false);
  }
  renderTracking();
}

function maskDeviceId(value) {
  const text = String(value || "");
  if (text.length <= 10) return text || "—";
  return `${text.slice(0, 6)}…${text.slice(-4)}`;
}

async function loadMe() {
  els.meDeviceId.textContent = maskDeviceId(getDeviceId());
}

function renderTrackingEmpty(rows) {
  if (rows.length || favoriteRows().length) {
    els.trackingEmpty.hidden = true;
    els.trackingEmpty.innerHTML = "";
    return;
  }
  els.trackingEmpty.hidden = false;
  els.trackingEmpty.innerHTML = `<strong>还没有投递记录</strong>` +
    `<p>在岗位库点击「投递」后会记录在这里，按状态更新进度。</p>` +
    `<div class="empty-actions"><button type="button" class="button mini" id="tracking-empty-go">去岗位库</button></div>`;
}

function renderTracking() {
  const rows = Array.isArray(state.tracking?.rows) ? state.tracking.rows : [];
  const active = rows.filter((row) => (row.status !== "saved" || row.isManual) && !CLOSED_STATUSES.has(row.status));
  const closed = rows.filter((row) => row.status !== "saved" && CLOSED_STATUSES.has(row.status));
  els.trackingActiveCount.textContent = active.length ? `${active.length} 个岗位` : "";
  els.trackingClosedCount.textContent = closed.length ? `${closed.length} 个岗位` : "";
  els.trackingActiveList.innerHTML = active.length
    ? active.map((row) => renderTrackCard(row)).join("")
    : `<p class="empty-hint">暂无进行中的投递。</p>`;
  els.trackingClosedList.innerHTML = closed.length
    ? closed.map((row) => renderTrackCard(row)).join("")
    : `<p class="empty-hint">还没有已结束的投递。</p>`;
  renderFavoritesList();
  renderTrackingEmpty(rows);
  els.trackingExport.disabled = rows.filter((row) => row.status !== "saved").length === 0;
}

async function updateTrackingStatus(applicationId, status, trigger) {
  if (!applicationId || !status) return;
  if (trigger) trigger.disabled = true;
  try {
    await api(`/api/tracking/${applicationId}`, {
      method: "PATCH",
      body: { deviceId: getDeviceId(), status },
    });
    await loadTracking();
    trackingNotice("投递进度已更新。");
  } catch (error) {
    trackingNotice(error.message || "更新失败，请稍后重试。");
    if (trigger) trigger.disabled = false;
  }
}

async function removeTracking(applicationId) {
  if (!applicationId || !window.confirm("确定移除这条投递记录吗？")) return;
  try {
    await api(`/api/tracking/${applicationId}?deviceId=${encodeURIComponent(getDeviceId())}`, { method: "DELETE" });
    await loadTracking();
    trackingNotice("已移除投递记录。");
  } catch (error) {
    trackingNotice(error.message || "移除失败，请稍后重试。");
  }
}

function manualFormNotice(message) {
  els.manualNotice.hidden = !message;
  els.manualNotice.textContent = message || "";
}

function openManualModal(row = null) {
  state.manualEditing = row?.applicationId || null;
  els.manualTitle.textContent = row ? "编辑投递" : "手动添加投递";
  els.manualPosition.value = row ? (row.manualTitle || "") : "";
  els.manualCompany.value = row ? (row.manualCompany || "") : "";
  els.manualUrl.value = row ? (row.manualExternalUrl || "") : "";
  els.manualStatus.value = row?.status || "applied";
  els.manualStatus.disabled = Boolean(row);
  els.manualNotes.value = row?.notes || "";
  els.manualSubmit.textContent = row ? "保存" : "添加";
  els.manualSubmit.disabled = false;
  manualFormNotice("");
  els.manualModal.hidden = false;
  requestAnimationFrame(() => els.manualPosition.focus());
}

function closeManualModal() {
  if (els.manualModal.hidden) return;
  els.manualModal.hidden = true;
  state.manualEditing = null;
  els.manualForm.reset();
  els.manualStatus.disabled = false;
  manualFormNotice("");
}

function editManualApplication(applicationId) {
  if (!applicationId) return;
  const row = (state.tracking?.rows || []).find((item) => item.applicationId === applicationId);
  if (row) openManualModal(row);
}

async function submitManualForm(event) {
  event.preventDefault();
  const title = els.manualPosition.value.trim();
  const company = els.manualCompany.value.trim();
  const externalUrl = els.manualUrl.value.trim();
  if ([title, company, externalUrl].filter(Boolean).length < 2) {
    manualFormNotice("岗位名、公司名和投递链接至少填写两项。");
    return;
  }
  if (externalUrl && !safeUrl(externalUrl)) {
    manualFormNotice("投递链接需要是有效的 http/https 地址。");
    return;
  }
  const applicationId = state.manualEditing;
  const body = { deviceId: getDeviceId(), title, company, externalUrl, notes: els.manualNotes.value };
  if (!applicationId) body.initialStatus = els.manualStatus.value;
  els.manualSubmit.disabled = true;
  manualFormNotice("");
  try {
    if (applicationId) {
      await api(`/api/tracking/manual/${encodeURIComponent(applicationId)}`, { method: "PATCH", body });
    } else {
      await api("/api/tracking/manual", { method: "POST", body });
    }
    closeManualModal();
    await loadTracking();
    trackingNotice(applicationId ? "投递记录已更新。" : "已添加自建投递。");
  } catch (error) {
    els.manualSubmit.disabled = false;
    manualFormNotice(error.message || "保存失败，请稍后重试。");
  }
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportTracking() {
  const rows = (Array.isArray(state.tracking?.rows) ? state.tracking.rows : [])
    .filter((row) => row.status !== "saved");
  if (!rows.length) {
    trackingNotice("还没有可导出的投递记录。");
    return;
  }
  const header = ["公司", "岗位", "城市", "方向", "投递日期", "状态"];
  const lines = [header, ...rows.map((row) => [
    row.company || "",
    row.position || "",
    Array.isArray(row.cities) && row.cities.length ? row.cities.join("、") : (row.location || ""),
    row.direction || "",
    row.appliedAt || "",
    row.statusLabel || STATUS_LABELS[row.status] || row.status,
  ])].map((cells) => cells.map(csvCell).join(","));
  download(
    `careerscope_tracking_${Date.now()}.csv`,
    new Blob([`\ufeff${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" }),
  );
  trackingNotice(`已导出 ${rows.length} 条投递记录（CSV）。`);
}

function favoriteRows() {
  return [...state.favorites]
    .map((key) => state.favoriteJobs[key])
    .filter(Boolean);
}

function favoritesNotice(message) {
  if (state.view === "me") {
    els.meNotice.hidden = !message;
    els.meNotice.textContent = message || "";
  } else {
    trackingNotice(message);
  }
}

function exportFavoritesJson() {
  const rows = favoriteRows();
  if (!rows.length) {
    favoritesNotice("还没有可导出的收藏。");
    return;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    deviceId: getDeviceId(),
    rows,
  };
  download(
    `careerscope_favorites_${Date.now()}.json`,
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }),
  );
  favoritesNotice(`已导出 ${rows.length} 条收藏（JSON）。`);
}

function renderFavoritesList() {
  const rows = favoriteRows();
  const missing = Math.max(0, state.favorites.size - rows.length);
  els.favoritesSummary.textContent = `${rows.length} 个收藏 · ${state.favoritesSynced ? "已同步到当前设备" : "本机暂存"}`;
  els.favoritesHint.textContent = rows.length
    ? "点击星标可取消收藏；收藏会写入当前匿名设备的投递记录，刷新后保留。"
    : "";
  if (els.favoritesExport) els.favoritesExport.disabled = rows.length === 0;
  if (!rows.length) {
    els.favoritesList.innerHTML = `<strong>还没有收藏的岗位</strong>` +
      (missing ? `<p>有旧收藏缺少岗位快照，请到岗位库重新收藏一次。</p>` : "") +
      `<div class="empty-actions"><button type="button" class="button mini" data-fav-action="explore">去岗位库</button></div>`;
    return;
  }
  indexJobs(rows);
  const missingNote = missing
    ? `<p class="empty-hint">还有 ${missing} 个旧收藏缺少岗位快照，可在岗位库重新收藏。</p>`
    : "";
  els.favoritesList.innerHTML = missingNote + rows.map((row) => renderJobCard(row)).join("");
}


// ---- 筛选组件（沿用既有交互）----



function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---- 工具提示 ----

let tooltipTimer = null;

function showTooltip(tip) {
  clearTimeout(tooltipTimer);
  els.tooltip.textContent = tip.dataset.tip || "";
  els.tooltip.hidden = false;
  const rect = tip.getBoundingClientRect();
  const box = els.tooltip.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - box.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - box.width - 8));
  let top = rect.top - box.height - 8;
  if (top < 8) {
    top = rect.bottom + 8;
  }
  els.tooltip.style.left = `${left}px`;
  els.tooltip.style.top = `${top}px`;
}

function hideTooltip() {
  els.tooltip.hidden = true;
}

document.addEventListener("mouseover", (event) => {
  const tip = event.target.closest(".tip");
  if (tip) showTooltip(tip);
});
document.addEventListener("mouseout", (event) => {
  if (event.target.closest(".tip")) hideTooltip();
});
document.addEventListener("focusin", (event) => {
  const tip = event.target.closest(".tip");
  if (tip) showTooltip(tip);
});
document.addEventListener("focusout", (event) => {
  if (event.target.closest(".tip")) hideTooltip();
});
window.addEventListener("scroll", hideTooltip, true);
window.addEventListener("resize", hideTooltip);

document.addEventListener("click", (event) => {
  document.querySelectorAll(".ms").forEach((host) => {
    if (!host.contains(event.target) && host.openState) host.openState(false);
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.querySelectorAll(".ms").forEach((host) => {
      if (host.openState) host.openState(false);
    });
    hideTooltip();
  }
});

// ---- 方向探索与采集条件 ----

const CONDITION_CARDS = [
  { key: "directionGroups", title: "方向类别", hint: "默认技术类，可按大类放宽" },
  { key: "directions", title: "职能方向", hint: "可多选，决定主要岗位方向" },
  { key: "industries", title: "行业", hint: "可多选，不选则覆盖全行业" },
  { key: "natures", title: "企业性质", hint: "民企、国企、外企等" },
  { key: "city", title: "城市", hint: "单选，留空表示全国" },
];

async function ensureMeta() {
  if (state.meta) return state.meta;
  try {
    state.meta = await api("/api/meta");
  } catch {
    // 调用方根据 state.meta 是否为 null 决定是否提示
  }
  return state.meta;
}

function exploreNotice(message) {
  els.exploreNotice.hidden = !message;
  els.exploreNotice.textContent = message || "";
}

function safeUrl(value) {
  const text = String(value || "").trim();
  if (/^mailto:[^\s"'<>]+$/i.test(text)) return text;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}



function renderJobTypeTabs() {
  els.jobTypeTabs.querySelectorAll("[data-job-type]").forEach((button) => {
    const active = button.dataset.jobType === state.jobType;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function setJobType(type) {
  if (!["intern", "campus"].includes(type) || state.jobType === type) return;
  state.jobType = type;
  state.explorePage = 1;
  saveCriteria();
  renderJobTypeTabs();
  loadExplore({ minMs: 300 });
}

function exploreQuery(page = 1) {
  const params = new URLSearchParams();
  params.set("type", state.jobType);
  params.set("page", String(page));
  params.set("pageSize", "24");
  if (state.criteria.directionGroups.size) params.set("directionGroup", [...state.criteria.directionGroups].join(","));
  if (state.criteria.directions.size) params.set("direction", [...state.criteria.directions].join(","));
  if (state.criteria.industries.size) params.set("industry", [...state.criteria.industries].join(","));
  if (state.criteria.natures.size) params.set("nature", [...state.criteria.natures].join(","));
  if (state.criteria.city) params.set("city", state.criteria.city);
  if (state.exploreSearch.trim()) params.set("q", state.exploreSearch.trim());
  return params.toString();
}

async function loadExplore({ append = false, minMs = 0 } = {}) {
  if (append && state.exploreLoading) return;
  const seq = state.recoSeq + 1;
  state.recoSeq = seq;
  const page = append ? state.explorePage + 1 : 1;
  const startedAt = Date.now();
  state.exploreLoading = true;
  if (!append) {
    state.exploreError = "";
    renderExploreResults();
  }
  renderExploreCards();
  try {
    const data = await api(`/api/jobs?${exploreQuery(page)}`);
    if (seq !== state.recoSeq) return;
    const defaultGroupOnly = state.criteria.directionGroups.size === 1
      && state.criteria.directionGroups.has(DEFAULT_DIRECTION_GROUPS[0]);
    const fallbackEligible = !append
      && !state.exploreGroupFallback
      && Number(data.total) === 0
      && defaultGroupOnly
      && !state.exploreSearch.trim()
      && !state.criteria.directions.size
      && !state.criteria.industries.size
      && !state.criteria.natures.size
      && !state.criteria.city;
    if (fallbackEligible) {
      state.exploreGroupFallback = true;
      state.criteria.directionGroups = new Set();
      saveCriteria();
      renderExploreCards();
      state.exploreLoading = false;
      loadExplore({ minMs });
      return;
    }
    state.explorePage = page;
    state.exploreError = "";
    if (append && state.explore) {
      const byId = new Map();
      for (const job of [...(state.explore.jobs || []), ...(data.jobs || [])]) {
        if (job && job.id && !byId.has(job.id)) byId.set(job.id, job);
      }
      state.explore = { ...data, jobs: [...byId.values()] };
    } else {
      state.explore = data;
    }
    indexJobs(state.explore.jobs);
    exploreNotice("");
  } catch (error) {
    if (seq !== state.recoSeq) return;
    if (append) {
      exploreNotice("加载更多失败，请稍后重试。");
    } else {
      state.explore = null;
      state.exploreError = error.message || "岗位加载失败，请稍后重试。";
    }
  }
  const elapsed = Date.now() - startedAt;
  if (minMs > elapsed) await new Promise((resolve) => window.setTimeout(resolve, minMs - elapsed));
  if (seq !== state.recoSeq) return;
  state.exploreLoading = false;
  renderExploreCards();
  renderExploreResults();
}

function criteriaSummary(key) {
  const criteria = state.criteria;
  if (key === "directionGroups") {
    return criteria.directionGroups.size ? [...criteria.directionGroups].join("、") : "全部类别";
  }
  if (key === "directions") {
    return criteria.directions.size ? [...criteria.directions].join("、") : "全部方向";
  }
  if (key === "industries") {
    return criteria.industries.size ? [...criteria.industries].join("、") : "全部行业";
  }
  if (key === "natures") {
    return criteria.natures.size ? [...criteria.natures].join("、") : "全部性质";
  }
  if (key === "city") return criteria.city || "全部城市";
  return "";
}

function criteriaCount(key) {
  const criteria = state.criteria;
  if (key === "directionGroups") return criteria.directionGroups.size;
  if (key === "directions") return criteria.directions.size;
  if (key === "industries") return criteria.industries.size;
  if (key === "natures") return criteria.natures.size;
  if (key === "city") return criteria.city ? 1 : 0;
  return 0;
}

function activeFilterLabels() {
  const criteria = state.criteria;
  const labels = [];
  if (criteria.directionGroups.size) labels.push([...criteria.directionGroups].join("、"));
  if (criteria.directions.size) labels.push([...criteria.directions].join("、"));
  if (criteria.natures.size) labels.push([...criteria.natures].join("、"));
  if (criteria.industries.size) labels.push([...criteria.industries].join("、"));
  if (criteria.city) labels.push(criteria.city);
  return labels;
}

function hasExploreFilters() {
  const criteria = state.criteria;
  return Boolean(
    state.exploreSearch.trim()
    || criteria.directionGroups.size
    || criteria.directions.size
    || criteria.industries.size
    || criteria.natures.size
    || criteria.city,
  );
}

function renderExploreCards() {
  const data = state.explore;
  const loading = state.exploreLoading;
  const matched = Number(data?.total) || 0;
  const grand = Number(data?.grandTotal) || matched;
  if (els.exploreSummary) {
    els.exploreSummary.textContent = loading
      ? (data ? "匹配中…" : "正在读取岗位库…")
      : (data ? (hasExploreFilters() ? `${matched} 个匹配` : `共 ${grand} 个岗位`) : "岗位库暂不可用");
    els.exploreSummary.classList.toggle("is-loading", loading);
  }
  const labels = activeFilterLabels();
  els.exploreCriteriaSummary.textContent = labels.length ? labels.join(" · ") : "全部";
  if (els.filterClear) els.filterClear.hidden = !hasExploreFilters();
  els.exploreCards.setAttribute("aria-busy", String(loading));
  els.exploreCards.innerHTML = CONDITION_CARDS.map((card) => {
    const count = criteriaCount(card.key);
    return `<button type="button" class="cond-card" data-cond="${card.key}">` +
      `<span class="cond-label">${escapeHtml(card.title)}</span>` +
      `<strong class="cond-value">${escapeHtml(criteriaSummary(card.key))}</strong>` +
      `<span class="cond-hint">${escapeHtml(card.hint)}</span>` +
      `<span class="cond-count${count ? "" : " is-empty"}">${count ? `已选 ${count} 项` : "未设置"}</span>` +
      `</button>`;
  }).join("");
}

function exploreEmptyHtml(total) {
  const query = state.exploreSearch.trim();
  const criteria = state.criteria;
  if (query) {
    return `<div class="empty-state">` +
      `<div class="empty-emoji" aria-hidden="true">🔍</div>` +
      `<strong>没有找到「${escapeHtml(query)}」</strong>` +
      `<p>试试更短的公司名、岗位名或关键词。</p>` +
      `<div class="empty-actions">` +
      `<button type="button" class="btn" data-explore-action="clear-search">清除搜索</button>` +
      `<button type="button" class="btn" data-explore-action="clear-criteria">清空筛选</button>` +
      `</div></div>`;
  }
  if (!total) {
    const untouched = !criteria.directions.size
      && !criteria.industries.size && !criteria.natures.size && !criteria.city;
    if (state.jobType === "campus" && untouched) {
      return `<div class="empty-state">` +
        `<div class="empty-emoji" aria-hidden="true">📭</div>` +
        `<strong>校招岗位还没有入库</strong>` +
        `<p>可以先看看实习机会。</p>` +
        `<div class="empty-actions"><button type="button" class="btn" data-explore-action="show-intern">查看实习岗位</button></div></div>`;
    }
    return `<div class="empty-state">` +
      `<div class="empty-emoji" aria-hidden="true">🗂️</div>` +
      `<strong>该方向暂无岗位</strong>` +
      `<p>试试放宽城市或方向？</p>` +
      `<div class="empty-actions">` +
      `<button type="button" class="btn" data-explore-action="relax-filters">放宽条件</button>` +
      `<button type="button" class="btn" data-explore-action="clear-criteria">清空筛选</button>` +
      `</div></div>`;
  }
  return `<div class="empty-state">` +
    `<strong>没有更多岗位</strong>` +
    `<p>当前条件下共 ${total} 个岗位。</p>` +
    `<div class="empty-actions"><button type="button" class="btn" data-explore-action="clear-criteria">清空筛选</button></div></div>`;
}

function exploreErrorHtml(message) {
  return `<div class="explore-error" role="alert"${message ? ` title="${escapeHtml(message)}"` : ""}>` +
    `<strong>岗位数据暂时无法加载</strong>` +
    `<p>请稍后刷新重试</p>` +
    `<div class="empty-actions"><button type="button" class="btn" data-explore-action="retry">重试</button></div>` +
    `</div>`;
}

function exploreCountText(data, shownCount) {
  const matched = Number(data?.total) || 0;
  const grand = Number(data?.grandTotal) || matched;
  if (hasExploreFilters()) {
    return `匹配 ${matched} 条 · 共 ${grand} 条`;
  }
  return `${grand} 个岗位 · 已显示 ${shownCount} 条`;
}

function renderExploreResults() {
  const data = state.explore;
  const loading = state.exploreLoading;
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  const total = Number(data?.total) || 0;
  els.exploreJobs.setAttribute("aria-busy", String(loading));
  els.exploreJobs.classList.toggle("is-matching", loading && Boolean(data));
  if (state.exploreError && !data) {
    els.exploreResultsSummary.textContent = "加载失败";
    els.exploreResultsSummary.classList.remove("is-loading");
    els.exploreJobs.innerHTML = exploreErrorHtml(state.exploreError);
    els.exploreMore.hidden = true;
    return;
  }
  if (!data) {
    els.exploreResultsSummary.textContent = loading ? "正在读取岗位库…" : "加载失败，请稍后重试";
    els.exploreResultsSummary.classList.toggle("is-loading", loading);
    els.exploreJobs.innerHTML = `<p class="empty-hint">正在加载岗位…</p>`;
    els.exploreMore.hidden = true;
    return;
  }
  if (loading && !jobs.length) {
    els.exploreResultsSummary.textContent = "加载中…";
    els.exploreResultsSummary.classList.add("is-loading");
    els.exploreMore.hidden = true;
    return;
  }
  els.exploreResultsSummary.classList.remove("is-loading");
  els.exploreResultsSummary.textContent = exploreCountText(data, jobs.length);
  if (!jobs.length) {
    els.exploreJobs.innerHTML = exploreEmptyHtml(total);
    els.exploreMore.hidden = true;
    return;
  }
  indexJobs(jobs);
  els.exploreJobs.innerHTML = jobs.map((job) => renderJobCard(job)).join("");
  els.exploreMore.hidden = !data.hasMore;
  els.exploreMore.disabled = loading;
  els.exploreMore.textContent = loading ? "加载中…" : "加载更多";
}

function resetExploreCriteria() {
  state.criteria.directionGroups = new Set();
  state.criteria.directions = new Set();
  state.criteria.industries = new Set();
  state.criteria.natures = new Set();
  state.criteria.city = "";
  state.exploreSearch = "";
  state.exploreGroupFallback = true;
  els.exploreSearch.value = "";
  saveCriteria();
  renderExploreCards();
  loadExplore({ minMs: 300 });
}

function directionOptions() {
  const meta = state.meta || {};
  const counts = state.explore?.facets?.directions || {};
  const withCount = (value) => ({ value, label: `${value}（${counts[value] || 0}）` });
  if (Array.isArray(meta.directionGroups) && meta.directionGroups.length) {
    return meta.directionGroups.map((entry) => ({
      group: entry.group,
      items: entry.items.map(withCount),
    }));
  }
  const values = [...new Set([...(meta.directions || []), ...Object.keys(counts)])];
  return [{ group: "", items: values.map(withCount) }];
}

function pickOptions(key) {
  const meta = state.meta || {};
  if (key === "directionGroups") {
    const counts = state.explore?.facets?.directionGroups || {};
    const hasCounts = Object.keys(counts).length > 0;
    const known = ["技术与数据", "业务与职能", "行业方向"];
    const values = [...new Set([...known, ...Object.keys(counts)])]
      .filter((value) => !hasCounts || value === "技术与数据" || counts[value]);
    return [{
      group: "",
      items: values.map((value) => ({ value, label: `${value}（${counts[value] || 0}）` })),
    }];
  }
  if (key === "directions") return directionOptions();
  if (key === "industries") {
    const counts = state.explore?.facets?.industries || {};
    const values = [...new Set([...(meta.industries || []), ...Object.keys(counts)])];
    return [{
      group: "",
      items: values.map((value) => ({
        value,
        label: `${value}（${counts[value] || 0}）`,
      })),
    }];
  }
  if (key === "natures") {
    const counts = state.explore?.facets?.natures || {};
    const values = [...new Set([...NATURE_OPTIONS, ...Object.keys(counts)])];
    return [{
      group: "",
      items: values.map((value) => ({
        value,
        label: counts[value] ? `${value}（${counts[value]}）` : value,
      })),
    }];
  }
  if (key === "city") {
    const counts = state.explore?.facets?.cities || {};
    const ranked = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const values = [...new Set([...ranked, ...(meta.collectCities || []), state.criteria.city].filter(Boolean))];
    return [{ group: "", items: values.map((value) => ({ value, label: `${value}（${counts[value] || 0}）` })) }];
  }
  return [];
}

function openPick(key) {
  const card = CONDITION_CARDS.find((entry) => entry.key === key);
  if (!card) return;
  const selected = key === "city"
    ? (state.criteria.city ? [state.criteria.city] : [])
    : [...state.criteria[key]];
  state.pick = {
    key,
    mode: key === "city" ? "single" : "multi",
    groups: pickOptions(key),
    draft: new Set(selected),
    search: "",
  };
  els.pickTitle.textContent = card.title;
  els.pickSearch.value = "";
  els.pickSearch.hidden = false;
  els.pickModal.hidden = false;
  renderPick();
  els.pickSearch.focus();
}

function renderPickBody() {
  const pick = state.pick;
  if (!pick) return;
  const keyword = pick.search.trim().toLowerCase();
  const html = pick.groups.map((entry) => {
    const items = entry.items.filter((item) => !keyword || item.label.toLowerCase().includes(keyword));
    if (!items.length) return "";
    const group = entry.group ? `<p class="pick-group">${escapeHtml(entry.group)}</p>` : "";
    return group + items.map((item) => (
      `<button type="button" class="pick-chip${pick.draft.has(item.value) ? " is-active" : ""}" ` +
      `data-pick-value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</button>`
    )).join("");
  }).join("");
  els.pickBody.innerHTML = html || `<p class="empty-hint">没有匹配的选项。</p>`;
}

function renderPickExtra() {
  els.pickExtra.hidden = true;
  els.pickExtra.innerHTML = "";
}

function renderPick() {
  renderPickBody();
  renderPickExtra();
}

function closePick() {
  els.pickModal.hidden = true;
  state.pick = null;
}

function confirmPick() {
  const pick = state.pick;
  if (!pick) return;
  const values = [...pick.draft];
  if (pick.key === "directionGroups") {
    state.criteria.directionGroups = new Set(values);
    state.exploreGroupFallback = false;
  } else if (pick.key === "directions") {
    state.criteria.directions = new Set(values);
  } else if (pick.key === "industries") {
    state.criteria.industries = new Set(values);
  } else if (pick.key === "natures") {
    state.criteria.natures = new Set(values);
  } else if (pick.key === "city") {
    state.criteria.city = values[0] || "";
  }
  saveCriteria();
  closePick();
  renderExploreCards();
  loadExplore({ minMs: 300 });
}

els.exploreCards.addEventListener("click", (event) => {
  const card = event.target.closest("[data-cond]");
  if (card) openPick(card.dataset.cond);
});

els.jobTypeTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-job-type]");
  if (button) setJobType(button.dataset.jobType);
});

let exploreSearchTimer = 0;
els.exploreSearch.addEventListener("input", () => {
  window.clearTimeout(exploreSearchTimer);
  exploreSearchTimer = window.setTimeout(() => {
    state.exploreSearch = els.exploreSearch.value.trim();
    saveCriteria();
    loadExplore({ minMs: 200 });
  }, 300);
});

function updateBackToTop() {
  if (!els.backToTop) return;
  els.backToTop.hidden = state.view !== "explore" || window.scrollY < 800;
}

async function loadMoreExplore() {
  if (state.view !== "explore" || state.exploreLoading) return;
  if (!state.explore?.hasMore || state.exploreError) return;
  await loadExplore({ append: true });
}

if ("IntersectionObserver" in window && els.exploreSentinel) {
  const sentinelObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) void loadMoreExplore();
  }, { rootMargin: "400px 0px" });
  sentinelObserver.observe(els.exploreSentinel);
}

els.exploreMore.addEventListener("click", () => {
  void loadMoreExplore();
});

window.addEventListener("scroll", updateBackToTop, { passive: true });

els.backToTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

els.exploreHero.addEventListener("click", (event) => {
  const button = event.target.closest("[data-hero-type]");
  if (!button) return;
  const type = button.dataset.heroType;
  if (state.jobType !== type) setJobType(type);
  document.getElementById("explore-results-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

els.exploreJobs.addEventListener("click", (event) => {
  const fav = event.target.closest("[data-fav-key]");
  if (fav) {
    void toggleFavorite(fav.dataset.favKey);
    return;
  }
  const applyButton = event.target.closest("[data-apply-job]");
  if (applyButton) {
    const job = (state.explore?.jobs || []).find((item) => item.id === applyButton.dataset.applyJob);
    if (job) void applyToJob(job);
    return;
  }
  const action = event.target.closest("[data-explore-action]")?.dataset.exploreAction;
  if (action === "clear-search") {
    window.clearTimeout(exploreSearchTimer);
    state.exploreSearch = "";
    els.exploreSearch.value = "";
    saveCriteria();
    loadExplore({ minMs: 200 });
  } else if (action === "clear-criteria") {
    resetExploreCriteria();
  } else if (action === "relax-filters") {
    state.criteria.directionGroups = new Set();
    state.criteria.directions = new Set();
    state.criteria.industries = new Set();
    state.criteria.natures = new Set();
    state.criteria.city = "";
    state.exploreGroupFallback = true;
    saveCriteria();
    renderExploreCards();
    loadExplore({ minMs: 200 });
  } else if (action === "all-groups") {
    state.criteria.directionGroups = new Set();
    state.exploreGroupFallback = true;
    saveCriteria();
    renderExploreCards();
    loadExplore({ minMs: 200 });
  } else if (action === "retry") {
    loadExplore();
  } else if (action === "show-intern") {
    setJobType("intern");
  }
});

els.favoritesList.addEventListener("click", (event) => {
  const fav = event.target.closest("[data-fav-key]");
  if (fav) {
    void toggleFavorite(fav.dataset.favKey);
    return;
  }
  const applyButton = event.target.closest("[data-apply-job]");
  if (applyButton) {
    const job = Object.values(state.favoriteJobs).find((item) => item.id === applyButton.dataset.applyJob);
    if (job) void applyToJob(job);
    return;
  }
  const action = event.target.closest("[data-fav-action]")?.dataset.favAction;
  if (action === "explore") switchView("explore");
});

function bindTrackingList(host) {
  host.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-manual-edit]");
    if (edit) {
      editManualApplication(edit.dataset.manualEdit);
      return;
    }
    const remove = event.target.closest("[data-tracking-remove]");
    if (remove) {
      void removeTracking(remove.dataset.trackingRemove);
      return;
    }
    const fav = event.target.closest("[data-fav-key]");
    if (fav) {
      void toggleFavorite(fav.dataset.favKey);
      return;
    }
    const advance = event.target.closest("[data-timeline-advance]");
    if (advance) {
      void updateTrackingStatus(advance.dataset.timelineAdvance, advance.dataset.status, advance);
      return;
    }
    const applyButton = event.target.closest("[data-apply-job]");
    if (applyButton) {
      const job = (state.tracking?.rows || []).find((item) => item.id === applyButton.dataset.applyJob);
      if (job) void applyToJob(job);
    }
  });
  host.addEventListener("change", (event) => {
    const select = event.target.closest("[data-tracking-transition]");
    if (select && select.value) {
      void updateTrackingStatus(select.dataset.trackingTransition, select.value, select);
    }
  });
}

bindTrackingList(els.trackingActiveList);
bindTrackingList(els.trackingClosedList);
els.trackingExport.addEventListener("click", exportTracking);
els.trackingManualAdd.addEventListener("click", () => openManualModal());
els.manualForm.addEventListener("submit", submitManualForm);
els.manualClose.addEventListener("click", closeManualModal);
els.manualCancel.addEventListener("click", closeManualModal);
els.manualModal.addEventListener("click", (event) => {
  if (event.target === els.manualModal) closeManualModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.manualModal.hidden) closeManualModal();
});
els.favoritesExport?.addEventListener("click", exportFavoritesJson);
els.trackingNext.addEventListener("click", () => switchView("explore"));
els.trackingEmpty.addEventListener("click", (event) => {
  if (event.target.closest("#tracking-empty-go")) switchView("explore");
});

els.pickSearch.addEventListener("input", () => {
  if (!state.pick) return;
  state.pick.search = els.pickSearch.value;
  renderPickBody();
});

els.pickBody.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-pick-value]");
  if (!chip || !state.pick) return;
  const value = chip.dataset.pickValue;
  if (state.pick.mode === "single") {
    state.pick.draft = new Set([value]);
  } else if (state.pick.draft.has(value)) {
    state.pick.draft.delete(value);
  } else {
    state.pick.draft.add(value);
  }
  renderPickBody();
});

els.pickClose.addEventListener("click", closePick);
els.pickCancel.addEventListener("click", closePick);
els.pickConfirm.addEventListener("click", confirmPick);
els.pickClear.addEventListener("click", () => {
  if (!state.pick) return;
  state.pick.draft = new Set();
  const extra = document.getElementById("pick-extra-text");
  if (extra) extra.value = "";
  const box = document.getElementById("pick-extra-open");
  if (box) box.checked = false;
  renderPickBody();
});
els.pickModal.addEventListener("click", (event) => {
  if (event.target === els.pickModal) closePick();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.pickModal.hidden) closePick();
});

els.exploreNext.addEventListener("click", () => switchView("board"));
els.collectNext.addEventListener("click", () => switchView("explore"));

// ---- 数据采集 ----

function collectNotice(message) {
  state.collectNotice = message || "";
  els.collectNoticeBox.hidden = !message;
  els.collectNoticeBox.textContent = message || "";
}

function collectLlmNotice(data) {
  const llm = data.llm || {};
  const message = llm.ready ? ""
    : `${llm.message || "站点未配置 LLM。"}未配置时仍按列表字段解析，岗位信息会相对简略。`;
  els.collectLlm.hidden = !message;
  els.collectLlm.textContent = message;
}

function collectCriteria() {
  return {
    majors: [...state.criteria.majors],
    directions: [...state.criteria.directions],
    industries: [...state.criteria.industries],
    positionKeywords: [...state.criteria.positionKeywords],
    city: state.criteria.city,
    majorText: state.criteria.majorText,
    publishedWithinDays: state.criteria.publishedWithinDays,
    openOnly: state.criteria.openOnly,
  };
}

function selectedSourceIds() {
  return (state.collect?.sources || [])
    .filter((source) => source.enabled && state.collectSourcesSelected.has(source.id))
    .map((source) => source.id);
}

function hasCriteria() {
  const criteria = collectCriteria();
  return Boolean(criteria.majors.length || criteria.directions.length || criteria.industries.length
    || criteria.positionKeywords.length || criteria.city || criteria.majorText
    || criteria.publishedWithinDays || criteria.openOnly);
}

function updateCollectEstimate() {
  const sources = state.collect?.sources || [];
  const selected = sources.filter((source) => source.enabled && state.collectSourcesSelected.has(source.id));
  els.collectRun.disabled = state.collecting || !selected.length;
  if (!selected.length) {
    els.collectEstimate.textContent = "请先勾选至少一个数据源。";
    return;
  }
  const detailCount = selected.filter((source) => source.detailFetchable).length;
  const target = Number(els.collectTarget.value) || 20;
  const parts = [`已选 ${selected.length} 个源`, `目标 ${target} 条（不足时自动翻页）`];
  parts.push(hasCriteria()
    ? "按方向探索设置的条件筛选"
    : "未设置方向条件，将采集来源中的全部实习岗位");
  parts.push(detailCount
    ? `${detailCount} 个详情源：每条约 1 次 LLM 调用，失败自动降级列表解析`
    : "所选源只用列表字段解析，不消耗 LLM");
  els.collectEstimate.textContent = parts.join(" · ");
}

const DEFAULT_SOURCE_CATEGORIES = [
  { id: "official", label: "官方招聘平台" },
  { id: "campus", label: "高校就业信息网" },
  { id: "gov", label: "政府与国企公开公告" },
  { id: "company", label: "企业官网招聘页" },
];

function sourceCategoryLabel(id) {
  const categories = state.collect?.sourceCategories || DEFAULT_SOURCE_CATEGORIES;
  return (categories.find((entry) => entry.id === id) || {}).label || "企业官网招聘页";
}

function renderCollectSources() {
  const sources = state.collect?.sources || [];
  if (!state.collectSourcesTouched) {
    state.collectSourcesSelected = new Set(sources.filter((source) => source.enabled).map((source) => source.id));
  }
  const officialTab = state.sourceTab !== "public";
  els.sourceTabs.querySelectorAll("[data-source-tab]").forEach((button) => {
    const active = button.dataset.sourceTab === state.sourceTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  els.sourceAddPublic.hidden = officialTab;

  const visible = sources.filter((source) => (
    (source.category || "company") === "official"
  ) === officialTab);
  const cardOf = (source) => {
    const checked = state.collectSourcesSelected.has(source.id) && source.enabled;
    const url = safeUrl(source.listUrl) || "";
    return `<article class="source-card">` +
      `<label class="source-pick"><input type="checkbox" data-source-pick="${escapeHtml(source.id)}"` +
      `${checked ? " checked" : ""}${source.enabled ? "" : " disabled"}>` +
      `<span><strong>${escapeHtml(source.name)}</strong>` +
      `<em>${escapeHtml(sourceCategoryLabel(source.category || "company"))}</em></span></label>` +
      (url ? `<p class="source-url">${escapeHtml(url)}</p>` : "") +
      `<div class="source-actions">` +
      (url ? `<a class="button ghost mini" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">查看地址</a>` : "") +
      (source.custom
        ? `<button type="button" class="button ghost mini" data-source-toggle="${escapeHtml(source.id)}">${source.enabled ? "停用" : "启用"}</button>` +
          `<button type="button" class="button ghost mini" data-source-remove="${escapeHtml(source.id)}">删除</button>`
        : "") +
      (source.enabled ? "" : `<span class="cell-muted">已停用</span>`) +
      `</div></article>`;
  };
  els.collectSources.innerHTML = visible.length
    ? visible.map(cardOf).join("")
    : `<p class="empty-hint">${officialTab
      ? "暂无官方招聘平台来源。"
      : "暂无公开渠道地址，可在下方添加列表页地址。"}</p>`;
  const selected = sources.filter((source) => source.enabled && state.collectSourcesSelected.has(source.id));
  els.collectSourcesSummary.textContent = `已选 ${selected.length} / ${sources.filter((source) => source.enabled).length}`;
  updateCollectEstimate();
}

function renderSourcePreview() {
  const data = state.sourcePreview;
  els.sourcePreview.hidden = !data;
  if (!data) {
    els.sourcePreview.innerHTML = "";
    return;
  }
  const items = (data.candidates || []).map((entry) => `<li>${escapeHtml(entry.position || "未识别岗位")}</li>`).join("");
  els.sourcePreview.innerHTML =
    `<p class="panel-hint">站点 ${escapeHtml(data.hostname || "")} · robots：${escapeHtml(data.robotsStatus || "未检查")} · ` +
    `本页发现 ${data.candidateCount} 条候选链接</p>` +
    `<p class="panel-hint">${escapeHtml(data.hint || "")}</p>` +
    (items ? `<ul>${items}</ul>` : "");
}

function pushCollectLog(text) {
  state.collectLog.push(String(text));
  if (state.collectLog.length > 30) state.collectLog = state.collectLog.slice(-30);
}

function renderCollectProgress() {
  const visible = state.collecting || Boolean(state.collectSummary) || state.collectLog.length > 0;
  els.collectProgress.hidden = !visible;
  if (!visible) return;
  els.collectBar.style.width = `${Math.max(0, Math.min(100, state.collectPercent))}%`;
  els.collectStep.textContent = state.collectStep || "准备中…";
  els.collectSummary.textContent = state.collectSummary || "";
  els.collectCancel.hidden = !state.collecting;
  els.collectCancel.disabled = state.collectCancel;
  els.collectLog.innerHTML = state.collectLog.slice(-12)
    .map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  els.collectLog.scrollTop = els.collectLog.scrollHeight;
  els.collectRetry.hidden = !state.collectFailures.length;
  els.collectRetry.textContent = `重试未解析（${state.collectFailures.length}）`;
  els.collectRetry.disabled = state.parsing;
}

async function loadCollect() {
  setLoading(els.collectLoading, true);
  try {
    await ensureMeta();
    const data = await api("/api/admin/collect/status");
    state.collect = data;
    renderCollect();
  } catch (error) {
    collectNotice(error.message || "采集状态加载失败。");
  } finally {
    setLoading(els.collectLoading, false);
  }
}

function renderCollect() {
  const data = state.collect;
  if (!data) return;
  collectLlmNotice(data);
  renderCollectSources();
  els.collectConfirmed.textContent = data.counts.internshipsConfirmed;
  els.collectModel.textContent = data.llm?.mode || "未配置";
  const pending = Number(data.counts.pending) || 0;
  const failed = Number(data.counts.failed) || 0;
  const backlog = pending + failed;
  els.reparseBar.hidden = backlog === 0;
  els.reparseText.textContent = backlog
    ? `有 ${backlog} 条已抓取内容等待解析${failed ? `（其中 ${failed} 条曾失败）` : ""}。`
    : "";
  els.collectReparse.disabled = state.collecting;
  els.collectReparse.textContent = state.reparseRunning ? "停止" : "继续解析";
  renderCollectProgress();
}

async function runCollect() {
  if (state.collecting) return;
  const sourceIds = selectedSourceIds();
  if (!sourceIds.length) {
    collectNotice("请先勾选至少一个数据源。");
    return;
  }
  const target = Number(els.collectTarget.value) || 20;
  state.collecting = true;
  state.collectCancel = false;
  state.collectFailures = [];
  state.collectLog = [];
  state.collectSummary = "";
  state.collectPercent = 4;
  state.collectStep = `正在抓取 ${sourceIds.length} 个数据源的列表…`;
  collectNotice("");
  renderCollectProgress();
  updateCollectEstimate();
  pushCollectLog(`开始采集：${sourceIds.length} 个来源，目标 ${target} 条`);
  try {
    const data = await api("/api/admin/collect/run", {
      method: "POST",
      body: { sourceIds, page: 1, target, criteria: collectCriteria() },
    });
    const totals = data.totals || {};
    for (const row of data.results || []) {
      if (row.error) {
        pushCollectLog(`${row.source?.name || "数据源"} 采集失败：${row.error}`);
      } else {
        pushCollectLog(`${row.source?.name || "数据源"}：抓取 ${row.pagesRun || 1} 页，新入队 ${row.queued || 0} 条，` +
          `发布时间过旧 ${row.dateFiltered || 0}，已截止 ${row.expired || 0}`);
      }
    }
    const items = (data.results || []).flatMap((row) => row.items || []);
    let stored = 0;
    let discarded = 0;
    let fail = 0;
    if (items.length) {
      state.collectPercent = 35;
      state.collectStep = `开始自动解析 ${items.length} 条岗位…`;
      renderCollectProgress();
      for (let index = 0; index < items.length; index += 1) {
        if (state.collectCancel) {
          pushCollectLog(`已停止后续解析，剩余 ${items.length - index} 条可在上方继续解析。`);
          break;
        }
        const item = items[index];
        try {
          const result = await api("/api/admin/collect/parse", {
            method: "POST",
            body: { rawId: item.rawId },
          });
          if (result?.internship?.status === "discarded") discarded += 1;
          else stored += 1;
        } catch (error) {
          fail += 1;
          state.collectFailures.push({
            rawId: item.rawId,
            company: item.company,
            position: item.position,
            error: error.message,
          });
          pushCollectLog(`未解析：${item.company} · ${item.position}（${error.message}）`);
        }
        state.collectPercent = 35 + Math.round(((index + 1) / items.length) * 62);
        state.collectStep = `解析 ${index + 1}/${items.length}：${item.company} · ${item.position}`;
        renderCollectProgress();
      }
    }
    state.collectPercent = 100;
    state.collectStep = "采集与解析完成";
    state.collectSummary = `新入队 ${totals.queued || 0} 条 · 入库 ${stored} 条` +
      (discarded ? ` · 未入库 ${discarded} 条` : "") +
      (fail ? ` · 未解析 ${fail} 条` : "") +
      (totals.dateFiltered ? ` · 发布时间过旧 ${totals.dateFiltered} 条` : "") +
      (totals.expired ? ` · 已截止 ${totals.expired} 条` : "");
    pushCollectLog(`完成：${state.collectSummary}`);
  } catch (error) {
    state.collectPercent = 100;
    state.collectStep = "采集失败";
    state.collectSummary = error.message;
    pushCollectLog(`采集失败：${error.message}`);
  } finally {
    state.collecting = false;
    renderCollectProgress();
    updateCollectEstimate();
    await loadCollect();
  }
}

async function setSourceEnabled(sourceId, enabled) {
  try {
    await api("/api/admin/collect/sources/toggle", {
      method: "POST",
      body: { sourceId, enabled },
    });
    collectNotice(enabled ? "数据源已启用。" : "数据源已停用。");
  } catch (error) {
    collectNotice(error.message);
  }
  await loadCollect();
}

async function removeCustomSource(sourceId) {
  try {
    await api("/api/admin/collect/sources/remove", {
      method: "POST",
      body: { sourceId },
    });
    state.collectSourcesSelected.delete(sourceId);
    collectNotice("自定义数据源已删除。");
  } catch (error) {
    collectNotice(error.message);
  }
  await loadCollect();
}

async function discoverSourceUrl() {
  const url = els.sourceUrl.value.trim();
  if (!url) {
    collectNotice("请填写公开列表页地址后再发现。");
    return;
  }
  state.sourcePreview = null;
  state.discovering = true;
  els.sourceDiscover.disabled = true;
  els.sourceAdd.disabled = true;
  renderSourcePreview();
  try {
    state.sourcePreview = await api("/api/admin/collect/sources/discover", {
      method: "POST",
      body: { url },
    });
    els.sourceAdd.disabled = false;
    collectNotice("");
  } catch (error) {
    collectNotice(error.message);
  } finally {
    state.discovering = false;
    els.sourceDiscover.disabled = false;
    renderSourcePreview();
  }
}

async function addCustomSource() {
  if (!state.sourcePreview) return;
  try {
    const data = await api("/api/admin/collect/sources/add", {
      method: "POST",
      body: {
        url: els.sourceUrl.value.trim(),
        category: "company",
      },
    });
    collectNotice(`已添加公开渠道「${data.name}」，勾选后即可采集。`);
    state.sourcePreview = null;
    els.sourceUrl.value = "";
    state.sourceTab = "public";
    els.sourceAdd.disabled = true;
    renderSourcePreview();
    await loadCollect();
  } catch (error) {
    collectNotice(error.message);
  }
}

async function retryFailures() {
  if (state.parsing || !state.collectFailures.length) return;
  state.parsing = true;
  els.collectRetry.disabled = true;
  const pending = [...state.collectFailures];
  const remaining = [];
  let ok = 0;
  collectNotice(`正在重试 ${pending.length} 条未解析内容…`);
  for (const item of pending) {
    try {
      const result = await api("/api/admin/collect/parse", {
        method: "POST",
        body: { rawId: item.rawId },
      });
      ok += 1;
      if (result?.internship?.status === "discarded") {
        pushCollectLog(`「${item.company || "未识别公司"}」缺少岗位名或已截止，未入库。`);
      }
    } catch (error) {
      remaining.push({ ...item, error: error.message });
    }
  }
  state.collectFailures = remaining;
  state.parsing = false;
  collectNotice(`重试完成：成功 ${ok} 条${remaining.length ? `，仍失败 ${remaining.length} 条` : ""}。`);
  renderCollectProgress();
  await loadCollect();
}

async function runReparse() {
  if (state.collecting) return;
  if (state.reparseRunning) {
    state.reparseCancel = true;
    els.collectReparse.textContent = "正在停止…";
    return;
  }
  state.reparseRunning = true;
  state.reparseCancel = false;
  els.collectReparse.textContent = "停止";
  let stored = 0;
  let discarded = 0;
  let failed = 0;
  let remaining = 0;
  try {
    for (let round = 0; round < 40; round += 1) {
      if (state.reparseCancel) break;
      els.reparseText.textContent = `正在解析第 ${round + 1} 批（每批 5 条），已入库 ${stored} 条…`;
      const result = await api("/api/admin/collect/reparse", { method: "POST", body: { limit: 5 } });
      stored += result.stored || 0;
      discarded += result.discarded || 0;
      failed += (result.failed || []).length;
      remaining = result.remaining || 0;
      if (!result.attempted || remaining === 0) break;
    }
    const parts = [`入库 ${stored} 条`];
    if (discarded) parts.push(`未入库 ${discarded} 条`);
    if (failed) parts.push(`失败 ${failed} 条`);
    parts.push(`剩余 ${remaining} 条`);
    collectNotice(`${state.reparseCancel ? "已停止解析" : "继续解析完成"}：${parts.join(" · ")}。`);
  } catch (error) {
    collectNotice(error.message);
  } finally {
    state.reparseRunning = false;
    await loadCollect();
  }
}

async function testLlm() {
  if (state.llmTesting) return;
  state.llmTesting = true;
  els.llmTest.disabled = true;
  els.llmTest.textContent = "测试中…";
  try {
    const result = await api("/api/admin/llm/test", { method: "POST", body: {} });
    if (result.model) els.collectModel.textContent = result.model;
    collectNotice(result.ok
      ? `解析模型 ${result.model} 连接正常。`
      : `解析模型 ${result.model || ""} 连接失败：${result.message || "未知错误"}`);
  } catch (error) {
    collectNotice(error.message);
  } finally {
    state.llmTesting = false;
    els.llmTest.disabled = false;
    els.llmTest.textContent = "测试连接";
  }
}

els.sourceTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-source-tab]");
  if (!button) return;
  state.sourceTab = button.dataset.sourceTab;
  renderCollectSources();
});

els.collectSources.addEventListener("change", (event) => {
  const box = event.target.closest("[data-source-pick]");
  if (!box) return;
  state.collectSourcesTouched = true;
  if (box.checked) {
    state.collectSourcesSelected.add(box.dataset.sourcePick);
  } else {
    state.collectSourcesSelected.delete(box.dataset.sourcePick);
  }
  renderCollectSources();
});

els.collectSources.addEventListener("click", async (event) => {
  const toggle = event.target.closest("[data-source-toggle]");
  if (toggle) {
    const source = (state.collect?.sources || []).find((entry) => entry.id === toggle.dataset.sourceToggle);
    await setSourceEnabled(toggle.dataset.sourceToggle, !source?.enabled);
    return;
  }
  const remove = event.target.closest("[data-source-remove]");
  if (remove) await removeCustomSource(remove.dataset.sourceRemove);
});

els.collectTarget.addEventListener("change", updateCollectEstimate);
els.collectRun.addEventListener("click", runCollect);
els.collectRetry.addEventListener("click", retryFailures);
els.collectReparse.addEventListener("click", runReparse);
els.llmTest.addEventListener("click", testLlm);
els.collectCancel.addEventListener("click", () => {
  state.collectCancel = true;
  state.collectStep = "将在当前条目解析完成后停止后续解析…";
  renderCollectProgress();
});
els.sourceDiscover.addEventListener("click", discoverSourceUrl);
els.sourceAdd.addEventListener("click", addCustomSource);

// ---- 样本集导出 ----

document.getElementById("export-sample-set").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await api("/api/admin/sample-sets/from-confirmed", { method: "POST", body: {} });
    state.meta = null;
    experimentNotice(`已创建样本集「${result.sampleSet.name}」，共 ${result.sampleSet.count} 条，可在新建实验中选择。`);
    await loadMeta();
  } catch (error) {
    experimentNotice(error.message);
  } finally {
    button.disabled = false;
  }
});

// ---- 解析实验 ----

function experimentNotice(message) {
  els.experimentNotice.hidden = !message;
  els.experimentNotice.textContent = message || "";
}

async function loadMeta() {
  try {
    state.meta = await api("/api/meta");
    renderMeta();
    if (state.detailId) await loadDetail(state.detailId);
  } catch (error) {
    experimentNotice(error.message);
  }
}

function updateExperimentFields() {
  const promptMode = els.kindSelect.value === "prompt_comparison";
  els.modelField.hidden = promptMode;
  els.promptField.hidden = !promptMode;
}

function renderMeta() {
  const meta = state.meta;
  if (!meta) return;
  const limits = meta.publicLimits || {};
  els.experimentQuota.textContent =
    `今日站点额度：已用 ${limits.siteCallsToday ?? 0} / ${limits.siteDailyCallLimit ?? "—"} 次，` +
    `剩余 ${limits.siteRemaining ?? "—"} 次；单次最多 ${limits.siteMaxSamples ?? 20} 条样本、${limits.siteMaxModels ?? 2} 个模型。`;
  document.querySelectorAll("[data-admin-quota]").forEach((item) => {
    item.textContent = `今日剩余解析次数：${limits.siteRemaining ?? "—"} / ${limits.siteDailyCallLimit ?? "—"}`;
  });

  const previousSet = els.sampleSetSelect.value;
  els.sampleSetSelect.replaceChildren();
  if (!meta.sampleSets.length) {
    els.sampleSetSelect.append(new Option("暂无样本集，请先导入", ""));
  }
  meta.sampleSets.forEach((set) => {
    els.sampleSetSelect.append(new Option(`${set.name}（${set.count} 条 · ${set.sourceType}）`, set.id));
  });
  if (previousSet && meta.sampleSets.some((set) => set.id === previousSet)) {
    els.sampleSetSelect.value = previousSet;
  }

  els.modelsBox.innerHTML = meta.models.map((model, index) => (
    `<label class="check-item"><input type="checkbox" value="${escapeHtml(model)}"${index === 0 ? " checked" : ""}>` +
    `<span>${escapeHtml(model)}</span></label>`
  )).join("");

  const versions = meta.promptVersions;
  const active = versions.find((version) => version.isActive);
  const fillVersions = (select, selectedId) => {
    select.replaceChildren();
    if (!versions.length) {
      select.append(new Option("暂无版本", ""));
      return;
    }
    versions.forEach((version) => {
      const label = `${version.versionId}${version.isActive ? "（当前）" : ""}`;
      select.append(new Option(label, version.versionId));
    });
    if (selectedId && versions.some((version) => version.versionId === selectedId)) {
      select.value = selectedId;
    }
  };
  fillVersions(els.oldVersionSelect, versions[1] ? versions[1].versionId : (active ? active.versionId : undefined));
  fillVersions(els.newVersionSelect, active ? active.versionId : undefined);

  els.promptRows.innerHTML = versions.map((version) => {
    const improvement = version.accuracyImprovement === null
      ? "—"
      : formatPercent(version.accuracyImprovement);
    return (
      `<tr>` +
      `<td class="cell-strong">${escapeHtml(version.versionId)}</td>` +
      `<td>${escapeHtml(TRIGGER_LABELS[version.triggerReason] || version.triggerReason || "—")}</td>` +
      `<td class="num">${version.fewShotCount}</td>` +
      `<td class="num">${improvement}</td>` +
      `<td>${escapeHtml(version.createdAt || "")}</td>` +
      `<td>${version.isActive ? '<span class="chip chip-interview">当前使用</span>' : '<span class="cell-muted">历史版本</span>'}</td>` +
      `<td>${version.isActive ? ""
        : `<button type="button" class="button ghost mini" data-version="${escapeHtml(version.versionId)}">设为当前</button>`}</td>` +
      `</tr>`
    );
  }).join("") || `<tr><td colspan="7" class="empty-cell">还没有 Prompt 版本。</td></tr>`;

  renderExperimentList();
  updateExperimentFields();
}

function statusChip(status) {
  if (status === "completed") return '<span class="chip chip-offer">已完成</span>';
  if (status === "failed") return '<span class="chip chip-rejected">失败</span>';
  if (status === "running") return '<span class="chip chip-applied">运行中</span>';
  return '<span class="chip chip-to-apply">待运行</span>';
}

function renderExperimentList() {
  const meta = state.meta;
  if (!meta) return;
  if (!meta.experiments.length) {
    els.experimentList.innerHTML = '<p class="empty-hint">还没有实验。先导入样本集，再创建模型对比或提示词对比实验。</p>';
    return;
  }
  const setCounts = new Map(meta.sampleSets.map((set) => [set.id, set.count]));
  els.experimentList.innerHTML = meta.experiments.map((experiment) => {
    const kindLabel = experiment.kind === "prompt_comparison" ? "提示词对比" : "模型对比";
    const running = state.running.has(experiment.id);
    const total = setCounts.get(experiment.sampleSetId) || 0;
    const config = experiment.config || {};
    const variantCount = experiment.kind === "prompt_comparison"
      ? (config.prompt_versions || []).length
      : (config.model_names || []).length;
    const progress = experiment.progress;
    let progressHtml = "";
    if (running || progress) {
      const variantIndex = progress ? progress.variantIndex : 0;
      const fraction = progress && total
        ? Math.min(1, (variantIndex + progress.offset / total) / Math.max(1, variantCount))
        : 0;
      progressHtml =
        `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(fraction * 100)}">` +
        `<span style="width:${Math.round(fraction * 100)}%"></span></div>` +
        `<p class="panel-hint">${running ? "正在运行…" : "已暂停"} 变体 ${Math.min(variantIndex + 1, variantCount)}/${variantCount}` +
        `${progress ? ` · 已处理 ${progress.offset}/${total} 条` : ""}</p>`;
    }
    const canRun = experiment.status !== "completed";
    const actions =
      `<button type="button" class="button mini" data-exp-action="run" data-id="${escapeHtml(experiment.id)}"${(running || !canRun) ? " disabled" : ""}>` +
      `${running ? "运行中…" : experiment.status === "running" ? "继续运行" : "开始运行"}</button>` +
      `<button type="button" class="button ghost mini" data-exp-action="detail" data-id="${escapeHtml(experiment.id)}">查看结果</button>` +
      `<button type="button" class="button ghost mini" data-exp-action="report" data-id="${escapeHtml(experiment.id)}">下载报告</button>` +
      (canRun
        ? `<button type="button" class="button ghost mini danger" data-exp-action="abandon" data-id="${escapeHtml(experiment.id)}"${running ? " disabled" : ""}>放弃</button>`
        : "");
    return (
      `<article class="experiment-card">` +
      `<div class="experiment-main">` +
      `<div class="experiment-title"><strong>${kindLabel}</strong>${statusChip(experiment.status)}` +
      `<span class="cell-muted">站点额度</span>` +
      `<span class="cell-muted">样本集 ${escapeHtml(experiment.sampleSetName || "—")}</span></div>` +
      `<p class="panel-hint">创建于 ${escapeHtml(experiment.createdAt || "")}` +
      `${experiment.note ? ` · 备注：${escapeHtml(experiment.note)}` : ""}</p>` +
      progressHtml +
      `</div>` +
      `<div class="experiment-actions">${actions}</div>` +
      `</article>`
    );
  }).join("");
}

els.experimentList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-exp-action]");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.expAction;
  if (action === "run") {
    await runExperiment(id);
    return;
  }
  if (action === "detail") {
    await loadDetail(id);
    return;
  }
  if (action === "report") {
    button.disabled = true;
    try {
      const report = await api(`/api/experiments/${id}/report`);
      download(report.filename, new Blob([report.markdown], { type: "text/markdown;charset=utf-8" }));
      experimentNotice("实验报告已下载。");
    } catch (error) {
      experimentNotice(error.message);
    } finally {
      button.disabled = false;
    }
    return;
  }
  if (action === "abandon") {
    button.disabled = true;
    try {
      await api(`/api/experiments/${id}/abandon`, { method: "POST", body: {} });
      experimentNotice("实验已标记为放弃运行。");
      await loadMeta();
    } catch (error) {
      experimentNotice(error.message);
    } finally {
      button.disabled = false;
    }
  }
});

async function runExperiment(id) {
  if (state.running.has(id)) return;
  state.running.add(id);
  renderExperimentList();
  let result = null;
  try {
    for (let guard = 0; guard < 300; guard += 1) {
      result = await api(`/api/experiments/${id}/run-batch`, {
        method: "POST",
        body: { budget: 8 },
      });
      if (result.done) break;
      renderExperimentList();
    }
    if (!result?.done) {
      experimentNotice("运行批次过多，已暂停。可稍后点击「继续运行」。");
    } else if (result.status === "completed") {
      experimentNotice(`实验已完成。${result.note ? `备注：${result.note}` : ""}`);
    } else if (result.paused) {
      experimentNotice(result.note || "实验已暂停，可稍后继续。");
    } else {
      experimentNotice(`实验未完成：${result.note || "请检查模型配置后重试。"}`);
    }
  } catch (error) {
    experimentNotice(error.message);
  } finally {
    state.running.delete(id);
    await loadMeta();
    if (result?.done) await loadDetail(id);
  }
}

async function loadDetail(id) {
  try {
    const detail = await api(`/api/experiments/${id}`);
    state.detail = detail;
    state.detailId = id;
    renderDetail();
  } catch (error) {
    experimentNotice(error.message);
  }
}

function renderDetail() {
  const detail = state.detail;
  if (!detail) return;
  const { experiment, sampleSet, results } = detail;
  els.detailPanel.hidden = false;
  els.detailTitle.textContent = `实验结果 · ${experiment.kind === "prompt_comparison" ? "提示词对比" : "模型对比"}`;
  let html =
    `<p class="panel-hint">样本集 ${escapeHtml(sampleSet?.name || "—")}（${sampleSet?.count ?? 0} 条）` +
    ` · 状态 ${escapeHtml(experiment.status)}` +
    `${experiment.note ? ` · 备注：${escapeHtml(experiment.note)}` : ""}</p>`;
  if (!results.length) {
    html += `<p class="empty-hint">还没有可展示的模型结果，先运行实验。</p>`;
    els.detail.innerHTML = html;
    return;
  }
  const completed = results.filter((result) => result.runStatus === "completed");
  html +=
    `<div class="table-wrap"><table class="board-table"><thead><tr>` +
    `<th scope="col">模型</th><th scope="col">Prompt</th><th scope="col">状态</th>` +
    `<th scope="col" class="num">整体准确率</th><th scope="col" class="num">召回率</th>` +
    `<th scope="col" class="num">耗时</th><th scope="col" class="num">token 成本</th>` +
    `</tr></thead><tbody>` +
    results.map((result) => (
      `<tr>` +
      `<td class="cell-strong">${escapeHtml(result.modelName)}</td>` +
      `<td>${escapeHtml(result.promptVersion)}</td>` +
      `<td>${result.runStatus === "completed" ? "成功" : "运行失败"}</td>` +
      `<td class="num">${formatPercent(result.overallAccuracy)}</td>` +
      `<td class="num">${formatPercent(result.overallRecall)}</td>` +
      `<td class="num">${result.runDurationMs} ms</td>` +
      `<td class="num">${result.tokenCost === null ? "—" : `${formatNumber(result.tokenCost, 4)} 元`}</td>` +
      `</tr>`
    )).join("") +
    `</tbody></table></div>`;

  if (completed.length) {
    html +=
      `<h3 class="subhead">字段准确率</h3>` +
      `<div class="table-wrap"><table class="board-table"><thead><tr><th scope="col">字段</th>` +
      completed.map((result) => `<th scope="col" class="num">${escapeHtml(result.modelName)}</th>`).join("") +
      `</tr></thead><tbody>` +
      FIELD_ORDER.map((field) => (
        `<tr><td>${escapeHtml(field)}</td>` +
        completed.map((result) => `<td class="num">${formatPercent(result.perFieldAccuracy[field])}</td>`).join("") +
        `</tr>`
      )).join("") +
      `</tbody></table></div>`;

    html += `<h3 class="subhead">错误案例</h3>`;
    for (const result of completed) {
      const cases = result.errorCases || [];
      html += `<div class="error-block"><strong>${escapeHtml(result.modelName)}</strong>`;
      html += cases.length
        ? `<ul class="error-list">${cases.map((item) => (
          `<li>字段 <code>${escapeHtml(item.field)}</code>：正确值 ${escapeHtml(item.gold_value || "null")}` +
          ` / 模型输出 ${escapeHtml(item.predicted_value || "null")}` +
          `（${escapeHtml(item.error_type || "未分类")}）</li>`
        )).join("")}</ul>`
        : `<p class="panel-hint">无错误案例。</p>`;
      html += `</div>`;
    }
  }
  els.detail.innerHTML = html;
}

document.getElementById("close-detail").addEventListener("click", () => {
  state.detailId = null;
  state.detail = null;
  els.detailPanel.hidden = true;
});

document.getElementById("download-report").addEventListener("click", async (event) => {
  if (!state.detailId) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const report = await api(`/api/experiments/${state.detailId}/report`);
    download(report.filename, new Blob([report.markdown], { type: "text/markdown;charset=utf-8" }));
  } catch (error) {
    experimentNotice(error.message);
  } finally {
    button.disabled = false;
  }
});

els.promptRows.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-version]");
  if (!button) return;
  button.disabled = true;
  try {
    await api("/api/admin/prompt/rollback", {
      method: "POST",
      body: { versionId: button.dataset.version },
    });
    experimentNotice(`已将 ${button.dataset.version} 设为当前 Prompt 版本。`);
    await loadMeta();
  } catch (error) {
    experimentNotice(error.message);
  } finally {
    button.disabled = false;
  }
});

els.kindSelect.addEventListener("change", updateExperimentFields);

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("文件读取失败，请重试。"));
    reader.readAsDataURL(file);
  });
}

els.sampleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fileInput = document.getElementById("sample-file");
  const nameInput = document.getElementById("sample-name");
  const file = fileInput.files?.[0];
  if (!file) {
    experimentNotice("请选择 .json 或 .csv 样本集文件。");
    return;
  }
  const submit = els.sampleForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const contentBase64 = await readFileAsBase64(file);
    const result = await api("/api/sample-sets", {
      method: "POST",
      body: { filename: file.name, contentBase64, name: nameInput.value.trim() },
    });
    const skipped = result.invalidRowNumbers.length
      ? `，跳过 ${result.invalidRowNumbers.length} 条无效条目（第 ${result.invalidRowNumbers.join("、")} 行）`
      : "";
    experimentNotice(`样本集「${result.sampleSet.name}」已创建，共 ${result.sampleSet.count} 条有效样本${skipped}。`);
    fileInput.value = "";
    nameInput.value = "";
    await loadMeta();
  } catch (error) {
    experimentNotice(error.message);
  } finally {
    submit.disabled = false;
  }
});

els.experimentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = els.experimentForm.querySelector('button[type="submit"]');
  const sampleSetId = els.sampleSetSelect.value;
  if (!sampleSetId) {
    experimentNotice("请先选择样本集。");
    return;
  }
  const kind = els.kindSelect.value;
  const body = {
    sampleSetId,
    kind,
    temperature: Number(els.temperature.value),
    maxTokens: Number(els.maxTokens.value),
  };
  if (kind === "prompt_comparison") {
    if (!els.oldVersionSelect.value || !els.newVersionSelect.value) {
      experimentNotice("请选择要对比的两个 Prompt 版本。");
      return;
    }
    body.modelNames = [state.meta?.models?.[0] || ""];
    body.promptVersions = [els.oldVersionSelect.value, els.newVersionSelect.value];
  } else {
    body.modelNames = [...els.modelsBox.querySelectorAll('input[type="checkbox"]:checked')]
      .map((input) => input.value);
    if (!body.modelNames.length) {
      experimentNotice("请至少选择一个候选模型。");
      return;
    }
    const active = state.meta?.promptVersions.find((version) => version.isActive);
    body.promptVersions = [active ? active.versionId : undefined];
  }
  submit.disabled = true;
  try {
    const result = await api("/api/experiments", { method: "POST", body });
    experimentNotice("实验已创建（站点额度），点击「开始运行」逐批执行解析与评测。");
    await loadMeta();
    await loadDetail(result.experiment.id);
  } catch (error) {
    experimentNotice(error.message);
  } finally {
    submit.disabled = false;
  }
});

// ---- 初始化 ----

function isKnownRoute() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/" || path === "/index.html" || path === "/admin" || path === "/admin.html";
}

function showNotFound() {
  document.querySelectorAll(".view").forEach((section) => {
    section.hidden = section.id !== "view-notfound";
  });
  els.topbarView.textContent = "页面不存在";
  document.title = "页面不存在 · 职途罗盘 CareerScope";
}

function showAdminAuth(message) {
  state.adminAuthed = false;
  document.querySelectorAll(".view").forEach((section) => {
    section.hidden = section.id !== "view-admin-auth";
  });
  els.topbarView.textContent = "管理后台";
  document.title = "管理后台 · 职途罗盘 CareerScope";
  els.adminAuthNotice.hidden = !message;
  els.adminAuthNotice.textContent = message || "";
  els.adminToken.value = "";
  els.adminToken.focus();
}

els.adminAuthForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = els.adminToken.value.trim();
  if (!token) return;
  els.adminAuthSubmit.disabled = true;
  els.adminAuthSubmit.textContent = "验证中…";
  try {
    try {
      window.sessionStorage.setItem(STORAGE_KEYS.adminToken, token);
    } catch {
      // 会话存储不可用时仅本次验证有效
    }
    await api("/api/admin/collect/status");
    state.adminAuthed = true;
    ensureAdminEntries();
    switchView("collect");
  } catch (error) {
    try {
      window.sessionStorage.removeItem(STORAGE_KEYS.adminToken);
    } catch {
      // 忽略存储清理失败
    }
    showAdminAuth(error.status === 401 ? "令牌不正确，请重试。" : (error.message || "验证失败，请稍后重试。"));
  } finally {
    els.adminAuthSubmit.disabled = false;
    els.adminAuthSubmit.textContent = "进入管理后台";
  }
});

hydrateCriteria();
hydrateCriteriaFromUrl();
hydrateFavorites();
getDeviceId();
void syncFavoritesFromServer();
renderJobTypeTabs();
renderExploreCards();

function syncAdminEntry() {
  const entry = document.getElementById("me-admin-entry");
  if (entry) entry.hidden = !state.isAdmin;
}
syncAdminEntry();

async function boot() {
  if (!isKnownRoute()) {
    showNotFound();
    return;
  }
  if (ADMIN_PATH) {
    try {
      await api("/api/admin/collect/status");
      state.adminAuthed = true;
      ensureAdminEntries();
      switchView("collect");
    } catch (error) {
      showAdminAuth(error.status === 401 ? "" : (error.message || ""));
    }
    return;
  }
  switchView(state.view);
}

void boot();
