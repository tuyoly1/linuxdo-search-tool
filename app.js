const STORAGE_KEY = "linuxdoSearchToolState";
const HISTORY_KEY = "linuxdoSearchToolHistory";

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

const memoryStore = new Map();
let storageWarningShown = false;

const state = {
  activeCategory: "all",
  cards: [],
  history: readJson(HISTORY_KEY, []),
};

const categoryLabels = {
  all: "全部",
  precise: "全站",
  title: "标题",
  tutorial: "教程",
  issue: "排错",
  tool: "工具",
  config: "配置",
  latest: "最新",
  source: "溯源",
};

const quickTerms = [
  "Codex",
  "Claude Code",
  "ChatGPT",
  "OpenAI API",
  "config.toml",
  "model_provider",
  "Windows",
  "WSL",
  "VS Code",
  "代理",
  "中转",
  "公益站 API",
  "Android",
  "STM32",
  "MFRC522",
];

const stopWords = new Set([
  "我",
  "想",
  "想要",
  "请问",
  "有没有",
  "如何",
  "怎么",
  "怎样",
  "什么",
  "哪个",
  "哪里",
  "一下",
  "相关",
  "问题",
  "求助",
  "找",
  "找找",
  "帮助",
]);

const noiseWords = ["抽奖", "闲聊", "纯水", "水贴", "签到", "灌水"];

const svg = {
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14V4ZM5 6h6v2H7v9h9v-4h2v6H5V6Z"></path></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h11v13H8V7Zm2 2v9h7V9h-7ZM5 4h11v2H7v9H5V4Z"></path></svg>',
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

function compact(value) {
  return String(value || "")
    .replace(/[？?。！!]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripQuestionLead(value) {
  return compact(value).replace(/^(我想|想要|请问|有没有|如何|怎么|怎样|帮我|求助)\s*/i, "");
}

function tokenize(value) {
  const normalized = String(value || "")
    .replace(/[，、；;|/]+/g, " ")
    .replace(/[“”]/g, '"');
  const matches = normalized.match(/"[^"]+"|[^\s]+/g) || [];
  return matches
    .map((item) => item.replace(/^"|"$/g, ""))
    .map((item) => item.replace(/^[,，.。?？!！:：]+|[,，.。?？!！:：]+$/g, ""))
    .map((item) => item.trim())
    .filter((item) => item && !stopWords.has(item));
}

function uniq(values) {
  const seen = new Set();
  const output = [];
  for (const value of values.filter(Boolean)) {
    const key = String(value).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function quote(value) {
  const safe = compact(value).replaceAll('"', "");
  return safe ? `"${safe}"` : "";
}

function joinParts(parts) {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function flattenTerms(values) {
  return values.flatMap((value) => (Array.isArray(value) ? flattenTerms(value) : tokenize(value)));
}

function termsWith(model, additions = []) {
  return uniq([...model.allTokens, ...flattenTerms(additions)]);
}

function termsNotIn(model, additions = []) {
  const existing = new Set(model.allTokens.map((item) => item.toLowerCase()));
  return uniq(flattenTerms(additions)).filter((term) => !existing.has(term.toLowerCase()));
}

function orGroup(words) {
  return `(${words.map(quote).join(" OR ")})`;
}

function dateAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - Number(days));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function selectedAfterDate() {
  const preset = els.datePreset.value;
  if (preset === "none") return "";
  if (preset === "custom") return els.customAfter.value || dateAgo(90);
  return dateAgo(preset);
}

function detectIntents(text) {
  const value = text.toLowerCase();
  const intents = [];
  if (/报错|错误|失败|失效|无法|不能|崩溃|解决|fix|error|failed/.test(value)) intents.push("排错");
  if (/教程|保姆级|学习|记录|踩坑|整理|怎么|如何|guide|tutorial/.test(value)) intents.push("教程");
  if (/工具|推荐|开源|整合|一键|替代|项目|github|tool/.test(value)) intents.push("工具");
  if (/最新|现在|可用|失效|更新|替代|today|latest/.test(value)) intents.push("最新");
  if (/配置|安装|环境变量|代理|windows|wsl|vscode|config|settings/.test(value)) intents.push("配置");
  return uniq(intents);
}

function buildModel() {
  const topic = stripQuestionLead(els.topicInput.value);
  const context = compact(els.contextInput.value);
  const topicTokens = tokenize(topic);
  const contextTokens = tokenize(context);
  const allTokens = uniq([...topicTokens, ...contextTokens]);
  const afterDate = selectedAfterDate();
  const exactBase = topic ? joinParts([quote(topic), termsNotIn({ allTokens: topicTokens }, contextTokens).join(" ")]) : allTokens.join(" ");
  const looseBase = allTokens.join(" ");
  const base = els.exactToggle.checked ? exactBase : looseBase;
  const negative = els.cleanToggle.checked ? noiseWords.map((word) => `-${word}`).join(" ") : "";
  const dateOperator = afterDate ? `after:${afterDate}` : "";
  const intents = detectIntents(`${topic} ${context}`);

  return {
    topic,
    context,
    topicTokens,
    contextTokens,
    allTokens,
    base,
    looseBase,
    negative,
    dateOperator,
    dateInternal: afterDate ? `after:${afterDate}` : "",
    afterDate,
    exact: els.exactToggle.checked,
    clean: els.cleanToggle.checked,
    comments: els.commentsToggle.checked,
    intents,
  };
}

function searchUrl(engine, query) {
  const encoded = encodeURIComponent(query);
  if (engine === "google") return `https://www.google.com/search?q=${encoded}`;
  if (engine === "bing") return `https://www.bing.com/search?q=${encoded}`;
  return `https://linux.do/search?q=${encoded}`;
}

function googleQuery(model, additions = [], options = {}) {
  const { date = true, title = false, orWords = [], noise = true } = options;
  const titlePhrase = model.topic || model.topicTokens.slice(0, 3).join(" ") || model.looseBase;
  const focus = title ? `intitle:${quote(titlePhrase)}` : model.base;
  const titleContext = title ? model.contextTokens.join(" ") : "";
  return joinParts([
    "site:linux.do",
    focus,
    titleContext,
    termsNotIn(model, additions).join(" "),
    date ? model.dateOperator : "",
    orWords.length ? orGroup(orWords) : "",
    noise ? model.negative : "",
  ]);
}

function bingQuery(model, additions = []) {
  return joinParts(["site:linux.do", termsWith(model, additions).join(" ")]);
}

function linuxQuery(model, additions = [], filters = [], options = {}) {
  const { date = true } = options;
  return joinParts([termsWith(model, additions).join(" "), date ? model.dateInternal : "", filters.join(" ")]);
}

function linkNote(engine) {
  if (engine === "google") return "实测最稳，推荐优先打开";
  if (engine === "bing") return "实测可能出现验证，适合作为备用入口";
  return "站内搜索可能先显示请稍候，等待后仍不出结果时改用 Google";
}

function makeLink(label, engine, query, primary = false) {
  return {
    label,
    engine,
    query,
    primary,
    note: linkNote(engine),
    url: searchUrl(engine, query),
  };
}

function makeCard({ id, category, title, desc, priority, google, bing, linux = [], web, timeFiltered = true }) {
  const links = [];
  if (google) links.push(makeLink("Google 推荐", "google", google, true));
  if (bing) links.push(makeLink("Bing 备用", "bing", bing));
  for (const item of linux) {
    links.push(makeLink(item.label, "linux", item.query));
  }
  if (web) links.push(makeLink("官网线索", "google", web));
  return {
    id,
    category,
    title,
    desc,
    priority,
    timeFiltered,
    links,
  };
}

function buildCards(model) {
  if (!model.base && !model.looseBase) return [];

  const cards = [
    makeCard({
      id: "precise-site",
      category: "precise",
      title: "全站不限时入口",
      desc: "先拿到最大召回面，适合不知道关键词是否新旧时使用。",
      priority: "P1",
      timeFiltered: false,
      google: googleQuery(model, [], { date: false }),
      bing: bingQuery(model),
      linux: [{ label: "L 站热度", query: linuxQuery(model, [], ["order:likes"], { date: false }) }],
    }),
    makeCard({
      id: "title-match",
      category: "title",
      title: "标题优先",
      desc: "适合找主题明确的教程、合集、工具贴。",
      priority: "P1",
      google: googleQuery(model, [], { title: true }),
      bing: bingQuery(model),
      linux: [{ label: "L 站标题", query: linuxQuery(model, [], ["in:title", "order:latest"]) }],
    }),
    makeCard({
      id: "tutorial-main",
      category: "tutorial",
      title: "教程和踩坑记录",
      desc: "优先找主楼信息完整、可照着做的帖子。",
      priority: "P2",
      google: googleQuery(model, [], { orWords: ["教程", "保姆级", "记录", "踩坑", "整理"] }),
      bing: bingQuery(model, ["教程"]),
      linux: [
        { label: "L 站教程", query: linuxQuery(model, ["教程"], ["in:first", "order:likes"]) },
        { label: "L 站踩坑", query: linuxQuery(model, ["踩坑"], ["in:first", "order:latest"]) },
      ],
    }),
    makeCard({
      id: "issue-fix",
      category: "issue",
      title: "报错和解决方案",
      desc: "适合已经遇到错误、失效、配置失败的场景。",
      priority: model.intents.includes("排错") ? "P1" : "P2",
      google: googleQuery(model, [], { orWords: ["报错", "错误", "无法使用", "解决", "失效"] }),
      bing: bingQuery(model, ["报错"]),
      linux: [
        { label: "L 站报错", query: linuxQuery(model, ["报错"], ["in:replies", "order:latest"]) },
        { label: "L 站解决", query: linuxQuery(model, ["解决"], ["in:replies", "order:latest"]) },
      ],
    }),
    makeCard({
      id: "tool-share",
      category: "tool",
      title: "工具和整合方案",
      desc: "适合找开源项目、脚本、一键包、替代工具。",
      priority: model.intents.includes("工具") ? "P1" : "P3",
      google: googleQuery(model, [], { orWords: ["开源", "分享", "推荐", "整合", "一键", "GitHub"] }),
      bing: bingQuery(model, ["工具"]),
      linux: [
        { label: "L 站开源", query: linuxQuery(model, ["开源"], ["min_posts:5", "order:likes"]) },
        { label: "L 站推荐", query: linuxQuery(model, ["推荐"], ["min_posts:5", "order:likes"]) },
        { label: "L 站整合", query: linuxQuery(model, ["整合"], ["min_posts:5", "order:latest"]) },
      ],
    }),
    makeCard({
      id: "config-env",
      category: "config",
      title: "环境和配置",
      desc: "专门找安装、配置文件、代理、环境变量相关内容。",
      priority: model.intents.includes("配置") ? "P1" : "P2",
      google: googleQuery(model, [], { orWords: ["配置", "安装", "环境变量", "代理", "config.toml", "settings.json"] }),
      bing: bingQuery(model, ["配置"]),
      linux: [
        { label: "L 站配置", query: linuxQuery(model, ["配置"], ["in:first", "order:latest"]) },
        { label: "L 站代理", query: linuxQuery(model, ["代理"], ["in:first", "order:latest"]) },
      ],
    }),
    makeCard({
      id: "latest-feedback",
      category: "latest",
      title: "最新可用性反馈",
      desc: "适合信息变化快的 AI、API、账号、模型、插件问题。",
      priority: model.intents.includes("最新") ? "P1" : "P2",
      google: googleQuery(model, [], { orWords: model.comments ? ["可用", "失效", "替代", "更新", "反馈"] : [] }),
      bing: bingQuery(model, ["最新"]),
      linux: [
        { label: "L 站最新", query: linuxQuery(model, [], ["order:latest"]) },
        { label: "L 站可用", query: linuxQuery(model, ["可用"], ["in:replies", "order:latest"]) },
        { label: "L 站失效", query: linuxQuery(model, ["失效"], ["in:replies", "order:latest"]) },
      ],
    }),
    makeCard({
      id: "source-check",
      category: "source",
      title: "官网和原始线索",
      desc: "从 L 站讨论里找官网、文档、GitHub，再回到原始来源确认。",
      priority: "P2",
      google: googleQuery(model, [], { orWords: ["官网", "文档", "GitHub", "原始链接"] }),
      bing: bingQuery(model, ["官网"]),
      linux: [
        { label: "L 站官网", query: linuxQuery(model, ["官网"], ["order:likes"]) },
        { label: "L 站 GitHub", query: linuxQuery(model, ["GitHub"], ["order:likes"]) },
      ],
      web: joinParts([termsWith(model).join(" "), "official documentation GitHub docs"]),
    }),
  ];

  if (/codex|claude code|claude|cursor/i.test(`${model.topic} ${model.context}`)) {
    const extra = ["config.toml", "settings.json", "model_provider", "代理", "Windows", "WSL"];
    cards.push(
      makeCard({
        id: "ai-config-special",
        category: "config",
        title: "AI 编程工具配置",
        desc: "补上配置文件、模型供应商、代理这些高频限定词，自动去重。",
        priority: "P1",
        google: googleQuery(model, extra),
        bing: bingQuery(model, ["config.toml", "model_provider"]),
        linux: [
          { label: "L 站 config", query: linuxQuery(model, ["config.toml"], ["in:first", "order:latest"]) },
          { label: "L 站模型", query: linuxQuery(model, ["model_provider"], ["in:first", "order:latest"]) },
        ],
      }),
    );
  }

  if (/api|中转|公益站|模型|openai|chatgpt/i.test(`${model.topic} ${model.context}`)) {
    cards.push(
      makeCard({
        id: "api-status-special",
        category: "latest",
        title: "API 和中转状态",
        desc: "重点看评论区最近反馈，旧帖很可能已经变了。",
        priority: "P1",
        google: googleQuery(model, ["可用", "失效", "额度", "风控", "替代"]),
        bing: bingQuery(model, ["可用", "失效"]),
        linux: [
          { label: "L 站可用", query: linuxQuery(model, ["可用"], ["in:replies", "order:latest"]) },
          { label: "L 站替代", query: linuxQuery(model, ["替代"], ["in:replies", "order:latest"]) },
          { label: "L 站风控", query: linuxQuery(model, ["风控"], ["in:replies", "order:latest"]) },
        ],
      }),
    );
  }

  if (/stm32|mfrc522|rc522|hal|cubemx/i.test(`${model.topic} ${model.context}`)) {
    const extra = ["STM32", "HAL", "CubeMX", "RC522", "MFRC522", "接线", "报错"];
    cards.push(
      makeCard({
        id: "embedded-debug-special",
        category: "issue",
        title: "嵌入式项目排错",
        desc: "把芯片、模块、HAL、CubeMX、接线和报错放在同一组里搜。",
        priority: "P1",
        google: googleQuery(model, extra),
        bing: bingQuery(model, ["HAL", "RC522", "报错"]),
        linux: [
          { label: "L 站 HAL", query: linuxQuery(model, ["HAL", "报错"], ["in:first", "order:likes"]) },
          { label: "L 站接线", query: linuxQuery(model, ["接线"], ["in:first", "order:likes"]) },
        ],
      }),
    );
  }

  return cards;
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
  els.quickStrip.innerHTML = quickTerms
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

function renderAll() {
  const model = buildModel();
  state.cards = buildCards(model);
  if (state.activeCategory !== "all" && !state.cards.some((card) => card.category === state.activeCategory)) {
    state.activeCategory = "all";
  }
  renderTabs();
  renderCards();
  renderPriorityList();
  renderInsights(model);
  renderTemplate(model);
  persistInputs();
}

function persistInputs() {
  writeJson(STORAGE_KEY, {
    topic: els.topicInput.value,
    context: els.contextInput.value,
    datePreset: els.datePreset.value,
    customAfter: els.customAfter.value,
    exact: els.exactToggle.checked,
    clean: els.cleanToggle.checked,
    comments: els.commentsToggle.checked,
  });
}

function restoreInputs() {
  const saved = readJson(STORAGE_KEY, null);
  if (!saved) return;
  els.topicInput.value = saved.topic || "";
  els.contextInput.value = saved.context || "";
  els.datePreset.value = saved.datePreset || "90";
  els.customAfter.value = saved.customAfter || "";
  els.exactToggle.checked = Boolean(saved.exact);
  els.cleanToggle.checked = saved.clean !== false;
  els.commentsToggle.checked = saved.comments !== false;
}

function datePresetText() {
  const selected = els.datePreset.selectedOptions[0];
  if (!selected) return "不限时间";
  if (els.datePreset.value === "custom") return els.customAfter.value ? `${els.customAfter.value} 后` : "自定义日期后";
  return selected.textContent;
}

function saveCurrentPlan() {
  const model = buildModel();
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
    savedAt: new Date().toISOString(),
  };
  const key = `${record.topic}__${record.context}__${record.datePreset}__${record.customAfter}`;
  const withoutDuplicate = state.history.filter((item) => `${item.topic}__${item.context}__${item.datePreset}__${item.customAfter}` !== key);
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
  if (opened) {
    setStatus(`已打开：${entry.card.title}`);
  } else {
    setStatus("浏览器拦截了弹窗，请用右侧优先入口逐个打开");
  }
}

function syncCustomDate() {
  els.customDateField.classList.toggle("hidden", els.datePreset.value !== "custom");
}

function addQuickTerm(term) {
  const target = els.topicInput.value.trim() ? els.contextInput : els.topicInput;
  const current = compact(target.value);
  if (current.toLowerCase().includes(term.toLowerCase())) return;
  target.value = compact(`${current} ${term}`);
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
  state.activeCategory = "all";
  syncCustomDate();
  renderAll();
  setStatus("已重置搜索条件");
}

function bindEvents() {
  [els.topicInput, els.contextInput, els.customAfter].forEach((input) => {
    input.addEventListener("input", renderAll);
  });

  [els.exactToggle, els.cleanToggle, els.commentsToggle].forEach((input) => {
    input.addEventListener("change", renderAll);
  });

  els.datePreset.addEventListener("change", () => {
    syncCustomDate();
    renderAll();
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
}

function runSelfTest() {
  const model = buildModel();
  return {
    hasTopicField: Boolean(els.topicInput),
    cards: state.cards.length,
    visibleCards: visibleCards().length,
    keywords: model.allTokens,
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
renderAll();

globalThis.__linuxdoSearchSelfTest = runSelfTest;
