const STORAGE_KEY = "linuxdoSearchToolState";
const HISTORY_KEY = "linuxdoSearchToolHistory";
const THEME_KEY = "linuxdoSearchToolTheme";

const Core = window.LinuxdoSearchCore;
const categoryLabels = Core.config.categoryLabels;
const defaultExcludeWords = Core.config.defaultNoiseWords.join(" ");

const els = {
  statusLine: document.querySelector("#statusLine"),
  topicInput: document.querySelector("#topicInput"),
  contextInput: document.querySelector("#contextInput"),
  datePreset: document.querySelector("#datePreset"),
  customAfter: document.querySelector("#customAfter"),
  customDateField: document.querySelector(".custom-date"),
  exactToggle: document.querySelector("#exactToggle"),
  cleanToggle: document.querySelector("#cleanToggle"),
  commentsToggle: document.querySelector("#commentsToggle"),
  excludeInput: document.querySelector("#excludeInput"),
  themeMode: document.querySelector("#themeMode"),
  quickStrip: document.querySelector("#quickStrip"),
  cardCount: document.querySelector("#cardCount"),
  keywordCount: document.querySelector("#keywordCount"),
  intentText: document.querySelector("#intentText"),
  categoryTabs: document.querySelector("#categoryTabs"),
  cardsGrid: document.querySelector("#cardsGrid"),
  emptyState: document.querySelector("#emptyState"),
  copyVisibleBtn: document.querySelector("#copyVisibleBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  savePlanBtn: document.querySelector("#savePlanBtn"),
  openBestBtn: document.querySelector("#openBestBtn"),
  priorityList: document.querySelector("#priorityList"),
  copyPriorityBtn: document.querySelector("#copyPriorityBtn"),
  historyList: document.querySelector("#historyList"),
  clearHistoryBtn: document.querySelector("#clearHistoryBtn"),
  questionTemplate: document.querySelector("#questionTemplate"),
  copyTemplateBtn: document.querySelector("#copyTemplateBtn"),
  copyFallback: document.querySelector("#copyFallback"),
  fallbackText: document.querySelector("#fallbackText"),
  closeFallbackBtn: document.querySelector("#closeFallbackBtn"),
};

const svg = {
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14V4ZM5 6h6v2H7v9h9v-4h2v6H5V6Z"></path></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h11v13H8V7Zm2 2v9h7V9h-7ZM5 4h11v2H7v9H5V4Z"></path></svg>',
};

const memoryStore = new Map();
let storageWarningShown = false;

const state = {
  activeCategory: "all",
  cards: [],
  history: readJson(HISTORY_KEY, []),
};

function readJson(key, fallback) {
  if (memoryStore.has(key)) return memoryStore.get(key);
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  memoryStore.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    if (!storageWarningShown) {
      storageWarningShown = true;
      setStatus("本次不保存历史，本地存储不可用");
    }
    return false;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function debounce(fn, wait = 300) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

const scheduleRender = debounce(() => renderAll(), 300);

function currentInput() {
  return {
    topic: els.topicInput.value,
    context: els.contextInput.value,
    datePreset: els.datePreset.value,
    customAfter: els.customAfter.value,
    exact: els.exactToggle.checked,
    clean: els.cleanToggle.checked,
    comments: els.commentsToggle.checked,
    excludeWords: els.excludeInput.value || defaultExcludeWords,
  };
}

function currentThemeMode() {
  return els.themeMode?.value || "system";
}

function applyThemeMode(mode) {
  const normalized = ["system", "light", "dark"].includes(mode) ? mode : "system";
  if (els.themeMode) els.themeMode.value = normalized;
  if (normalized === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.dataset.theme = normalized;
  }
}

function priorityRank(priority) {
  const match = String(priority).match(/\d+/);
  return match ? Number(match[0]) : 9;
}

function priorityEntries(limit = 5) {
  return [...state.cards]
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.title.localeCompare(b.title, "zh-CN"))
    .map((card) => ({ card, link: card.links.find((link) => link.primary) || card.links[0] }))
    .filter((entry) => entry.link)
    .slice(0, limit);
}

function visibleCards() {
  if (state.activeCategory === "all") return state.cards;
  return state.cards.filter((card) => card.category === state.activeCategory);
}

function renderQuickTerms() {
  els.quickStrip.innerHTML = Core.config.quickTerms
    .map((term) => `<button class="quick-chip" type="button" data-term="${escapeHtml(term)}">${escapeHtml(term)}</button>`)
    .join("");
}

function renderTabs() {
  const counts = state.cards.reduce(
    (acc, card) => {
      acc.all += 1;
      acc[card.category] = (acc[card.category] || 0) + 1;
      return acc;
    },
    { all: 0 },
  );

  const tabs = Object.entries(categoryLabels).filter(([key]) => key === "all" || counts[key]);
  els.categoryTabs.innerHTML = tabs
    .map(([key, label]) => {
      const active = state.activeCategory === key ? "active" : "";
      return `<button class="tab-btn ${active}" type="button" data-category="${key}">${label} ${counts[key] || 0}</button>`;
    })
    .join("");
}

function renderCards() {
  const cards = visibleCards();
  els.emptyState.classList.toggle("hidden", state.cards.length > 0);
  els.cardsGrid.innerHTML = cards.map(renderCard).join("");
  els.copyVisibleBtn.disabled = cards.length === 0;
  els.openBestBtn.disabled = state.cards.length === 0;
}

function renderCard(card) {
  const badge = categoryLabels[card.category] || card.category;
  const queryText = card.links.map((link) => `${link.label}:\n${link.query}`).join("\n\n");
  const linkButtons = card.links
    .map((link) => {
      const primary = link.primary ? "primary-link" : "";
      return `<a class="query-link ${primary}" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer" title="${escapeHtml(link.note)}">${svg.open}<span>${escapeHtml(link.label)}</span></a>`;
    })
    .join("");
  const timeBadge = card.timeFiltered
    ? '<span class="time-chip">含时间筛选</span>'
    : '<span class="time-chip muted">不限时</span>';
  return `
    <article class="result-card" data-card-id="${escapeHtml(card.id)}" data-card-category="${escapeHtml(card.category)}">
      <div class="card-head">
        <div class="card-title">
          <span class="badge ${escapeHtml(card.category)}">${escapeHtml(badge)}</span>
          <h2>${escapeHtml(card.title)}</h2>
          ${timeBadge}
        </div>
        <span class="priority">${escapeHtml(card.priority)}</span>
      </div>
      <p class="card-desc">${escapeHtml(card.desc)}</p>
      <div class="query-box">${escapeHtml(queryText)}</div>
      <div class="link-row">
        ${linkButtons}
        <button class="copy-query" type="button" data-copy="${escapeHtml(card.id)}">${svg.copy}<span>复制</span></button>
      </div>
    </article>
  `;
}

function renderPriorityList() {
  const entries = priorityEntries();
  els.copyPriorityBtn.disabled = entries.length === 0;
  els.priorityList.innerHTML = entries.length
    ? entries
        .map(
          ({ card, link }) => `
            <a class="priority-item" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">
              <strong>${escapeHtml(card.title)}</strong>
              <span>${escapeHtml(link.label)} · ${escapeHtml(link.query)}</span>
            </a>
          `,
        )
        .join("")
    : `<div class="empty compact">生成搜索卡后会出现最值得先打开的入口。</div>`;
}

function renderInsights(model) {
  els.cardCount.textContent = state.cards.length;
  els.keywordCount.textContent = model.allTokens.length;
  els.intentText.textContent = model.allTokens.length ? model.intents.join(" / ") || "综合搜索" : "待输入";
}

function renderHistory() {
  if (!state.history.length) {
    els.historyList.innerHTML = '<div class="history-item"><strong>还没有保存记录</strong><span>保存后可以一键恢复搜索条件。</span></div>';
    els.clearHistoryBtn.disabled = true;
    return;
  }
  els.clearHistoryBtn.disabled = false;
  els.historyList.innerHTML = state.history
    .map(
      (item, index) => `
        <button class="history-item" type="button" data-history="${index}">
          <strong>${escapeHtml(item.topic || "未命名搜索")}</strong>
          <span>${escapeHtml(item.context || "无额外限定")} · ${escapeHtml(item.datePresetText || "不限时间")}</span>
        </button>
      `,
    )
    .join("");
}

function renderTemplate(model) {
  const cards = state.cards.slice(0, 4);
  const searchLines = cards.length
    ? cards
        .map((card) => {
          const first = card.links.find((link) => link.primary) || card.links[0];
          return `- ${card.title}: ${first?.query || ""}`;
        })
        .join("\n")
    : "- ";
  els.questionTemplate.textContent = [
    "目标：",
    model.topic || "",
    "",
    "环境：",
    model.context || "",
    "",
    "已生成的搜索入口：",
    searchLines,
    "",
    "已看过的帖子/文档：",
    "- ",
    "",
    "可复用信息：",
    "- 配置：",
    "- 命令：",
    "- 坑点：",
    "- 评论区修正：",
    "",
    "仍需确认：",
    "1. ",
    "2. ",
    "",
    "自己的结论：",
    "",
  ].join("\n");
}

function renderAll(options = {}) {
  const model = Core.buildModel(currentInput());
  state.cards = Core.buildCards(model);
  if (state.activeCategory !== "all" && !state.cards.some((card) => card.category === state.activeCategory)) {
    state.activeCategory = "all";
  }
  renderTabs();
  renderCards();
  renderPriorityList();
  renderInsights(model);
  renderTemplate(model);
  if (options.persist !== false) persistInputs();
}

function persistInputs() {
  const themeMode = currentThemeMode();
  writeJson(STORAGE_KEY, {
    topic: els.topicInput.value,
    context: els.contextInput.value,
    datePreset: els.datePreset.value,
    customAfter: els.customAfter.value,
    exact: els.exactToggle.checked,
    clean: els.cleanToggle.checked,
    comments: els.commentsToggle.checked,
    excludeWords: els.excludeInput.value,
    themeMode,
  });
  writeJson(THEME_KEY, themeMode);
}

function restoreInputs() {
  const saved = readJson(STORAGE_KEY, null);
  const savedTheme = readJson(THEME_KEY, saved?.themeMode || "system");
  if (saved) {
    els.topicInput.value = saved.topic || "";
    els.contextInput.value = saved.context || "";
    els.datePreset.value = saved.datePreset || "90";
    els.customAfter.value = saved.customAfter || "";
    els.exactToggle.checked = Boolean(saved.exact);
    els.cleanToggle.checked = saved.clean !== false;
    els.commentsToggle.checked = saved.comments !== false;
    els.excludeInput.value = saved.excludeWords || defaultExcludeWords;
  } else {
    els.excludeInput.value = defaultExcludeWords;
  }
  applyThemeMode(savedTheme);
}

function datePresetText() {
  const selected = els.datePreset.selectedOptions[0];
  if (!selected) return "不限时间";
  if (els.datePreset.value === "custom") return els.customAfter.value ? `${els.customAfter.value} 后` : "自定义日期后";
  return selected.textContent;
}

function saveCurrentPlan() {
  const model = Core.buildModel(currentInput());
  if (!model.topic && !model.context) {
    setStatus("先输入一个搜索目标");
    return;
  }
  const record = {
    topic: model.topic || model.looseBase,
    context: model.context,
    datePreset: els.datePreset.value,
    customAfter: els.customAfter.value,
    datePresetText: datePresetText(),
    exact: els.exactToggle.checked,
    clean: els.cleanToggle.checked,
    comments: els.commentsToggle.checked,
    excludeWords: els.excludeInput.value,
    savedAt: new Date().toISOString(),
  };
  const key = `${record.topic}__${record.context}__${record.datePreset}__${record.customAfter}__${record.excludeWords}`;
  const withoutDuplicate = state.history.filter((item) => `${item.topic}__${item.context}__${item.datePreset}__${item.customAfter}__${item.excludeWords || ""}` !== key);
  state.history = [record, ...withoutDuplicate].slice(0, 10);
  writeJson(HISTORY_KEY, state.history);
  renderHistory();
  setStatus("已保存当前搜索");
}

function restoreHistory(index) {
  const item = state.history[index];
  if (!item) return;
  els.topicInput.value = item.topic || "";
  els.contextInput.value = item.context || "";
  els.datePreset.value = item.datePreset || "90";
  els.customAfter.value = item.customAfter || "";
  els.exactToggle.checked = Boolean(item.exact);
  els.cleanToggle.checked = item.clean !== false;
  els.commentsToggle.checked = item.comments !== false;
  els.excludeInput.value = item.excludeWords || defaultExcludeWords;
  syncCustomDate();
  renderAll();
  setStatus("已恢复搜索记录");
}

function setStatus(message) {
  els.statusLine.textContent = message;
}

function copyCard(card) {
  return [
    `## ${card.title}`,
    `优先级: ${card.priority}`,
    `时间: ${card.timeFiltered ? "含时间筛选" : "不限时"}`,
    ...card.links.map((link) => `${link.label}: ${link.query}`),
  ].join("\n");
}

function priorityCopyText() {
  const entries = priorityEntries();
  return entries.map(({ card, link }) => `${card.title} / ${link.label}\n${link.query}\n${link.url}`).join("\n\n");
}

function showCopyFallback(text) {
  els.fallbackText.value = text;
  els.copyFallback.classList.remove("hidden");
  els.fallbackText.focus();
  els.fallbackText.select();
}

function hideCopyFallback() {
  els.copyFallback.classList.add("hidden");
}

async function copyText(text, okMessage) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setStatus(okMessage);
  } catch {
    showCopyFallback(text);
    setStatus("复制失败，已显示手动复制内容");
  }
}

function openBest() {
  const [entry] = priorityEntries(1);
  if (!entry) {
    setStatus("先输入一个搜索目标");
    return;
  }
  const opened = window.open(entry.link.url, "_blank", "noopener");
  setStatus(opened ? `已打开：${entry.card.title}` : "浏览器拦截了弹窗，请用右侧优先入口逐个打开");
}

function syncCustomDate() {
  els.customDateField.classList.toggle("hidden", els.datePreset.value !== "custom");
}

function addQuickTerm(term) {
  const target = els.topicInput.value.trim() ? els.contextInput : els.topicInput;
  const current = Core.compact(target.value);
  if (current.toLowerCase().includes(term.toLowerCase())) return;
  target.value = Core.compact(`${current} ${term}`);
  renderAll();
}

function resetAll() {
  els.topicInput.value = "";
  els.contextInput.value = "";
  els.datePreset.value = "90";
  els.customAfter.value = "";
  els.exactToggle.checked = false;
  els.cleanToggle.checked = true;
  els.commentsToggle.checked = true;
  els.excludeInput.value = defaultExcludeWords;
  state.activeCategory = "all";
  syncCustomDate();
  renderAll();
  setStatus("已重置搜索条件");
}

function bindEvents() {
  [els.topicInput, els.contextInput, els.customAfter, els.excludeInput].forEach((input) => {
    input.addEventListener("input", scheduleRender);
  });

  [els.exactToggle, els.cleanToggle, els.commentsToggle].forEach((input) => {
    input.addEventListener("change", renderAll);
  });

  els.datePreset.addEventListener("change", () => {
    syncCustomDate();
    renderAll();
  });

  els.themeMode.addEventListener("change", () => {
    applyThemeMode(currentThemeMode());
    renderAll();
    setStatus("已更新主题偏好");
  });

  els.quickStrip.addEventListener("click", (event) => {
    const button = event.target.closest("[data-term]");
    if (!button) return;
    addQuickTerm(button.dataset.term);
  });

  els.categoryTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.activeCategory = button.dataset.category;
    renderTabs();
    renderCards();
  });

  els.cardsGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-copy]");
    if (!button) return;
    const card = state.cards.find((item) => item.id === button.dataset.copy);
    if (!card) return;
    copyText(copyCard(card), `已复制：${card.title}`);
  });

  els.copyVisibleBtn.addEventListener("click", () => {
    const cards = visibleCards();
    if (!cards.length) return;
    copyText(cards.map(copyCard).join("\n\n"), `已复制 ${cards.length} 张搜索卡`);
  });

  els.copyPriorityBtn.addEventListener("click", () => {
    const text = priorityCopyText();
    if (!text) return;
    copyText(text, "已复制优先入口");
  });

  els.copyTemplateBtn.addEventListener("click", () => {
    copyText(els.questionTemplate.textContent, "已复制检索清单");
  });

  els.savePlanBtn.addEventListener("click", saveCurrentPlan);
  els.openBestBtn.addEventListener("click", openBest);
  els.resetBtn.addEventListener("click", resetAll);
  els.closeFallbackBtn.addEventListener("click", hideCopyFallback);
  els.copyFallback.addEventListener("click", (event) => {
    if (event.target === els.copyFallback) hideCopyFallback();
  });

  els.historyList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-history]");
    if (!button) return;
    restoreHistory(Number(button.dataset.history));
  });

  els.clearHistoryBtn.addEventListener("click", () => {
    state.history = [];
    writeJson(HISTORY_KEY, state.history);
    renderHistory();
    setStatus("已清空搜索记录");
  });

  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener?.("change", () => {
    if (currentThemeMode() === "system") applyThemeMode("system");
  });
}

function runSelfTest() {
  const model = Core.buildModel(currentInput());
  return {
    hasTopicField: Boolean(els.topicInput),
    cards: state.cards.length,
    visibleCards: visibleCards().length,
    keywords: model.allTokens,
    excludeWords: model.excludeWords,
    themeMode: currentThemeMode(),
    priorityEntries: priorityEntries().length,
    firstPriorityUrl: priorityEntries()[0]?.link.url || "",
    templateLength: els.questionTemplate.textContent.length,
  };
}

restoreInputs();
renderQuickTerms();
syncCustomDate();
bindEvents();
renderHistory();
renderAll({ persist: false });

globalThis.__linuxdoSearchSelfTest = runSelfTest;
