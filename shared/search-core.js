(function () {
  const targetForum = {
    name: "Linux.do",
    domain: "linux.do",
    searchUrl(query) {
      return `https://${this.domain}/search?q=${encodeURIComponent(query)}`;
    },
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

  const defaultNoiseWords = ["抽奖", "闲聊", "纯水", "水贴", "签到", "灌水"];

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

  function selectedAfterDate(datePreset, customAfter) {
    if (datePreset === "none") return "";
    if (datePreset === "custom") return customAfter || dateAgo(90);
    return dateAgo(datePreset || 90);
  }

  function parseExcludeWords(value) {
    if (Array.isArray(value)) return uniq(value.map(compact).filter(Boolean));
    const parsed = tokenize(value);
    return parsed.length ? parsed : [...defaultNoiseWords];
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

  function buildModel(input = {}) {
    const topic = stripQuestionLead(input.topic);
    const context = compact(input.context);
    const topicTokens = tokenize(topic);
    const contextTokens = tokenize(context);
    const allTokens = uniq([...topicTokens, ...contextTokens]);
    const afterDate = selectedAfterDate(input.datePreset || "90", input.customAfter || "");
    const exactBase = topic ? joinParts([quote(topic), termsNotIn({ allTokens: topicTokens }, contextTokens).join(" ")]) : allTokens.join(" ");
    const looseBase = allTokens.join(" ");
    const base = input.exact ? exactBase : looseBase;
    const activeExcludeWords = parseExcludeWords(input.excludeWords);
    const negative = input.clean ? activeExcludeWords.map((word) => `-${word}`).join(" ") : "";
    const dateOperator = afterDate ? `after:${afterDate}` : "";
    const searchText = `${topic} ${context}`;
    const intents = detectIntents(searchText);

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
      exact: Boolean(input.exact),
      clean: input.clean !== false,
      comments: input.comments !== false,
      excludeWords: activeExcludeWords,
      intents,
      searchText,
    };
  }

  function searchUrl(engine, query) {
    const encoded = encodeURIComponent(query);
    if (engine === "google") return `https://www.google.com/search?q=${encoded}`;
    if (engine === "bing") return `https://www.bing.com/search?q=${encoded}`;
    return targetForum.searchUrl(query);
  }

  function googleQuery(model, additions = [], options = {}) {
    const { date = true, title = false, orWords = [], noise = true } = options;
    const titlePhrase = model.topic || model.topicTokens.slice(0, 3).join(" ") || model.looseBase;
    const focus = title ? `intitle:${quote(titlePhrase)}` : model.base;
    const titleContext = title ? model.contextTokens.join(" ") : "";
    return joinParts([
      `site:${targetForum.domain}`,
      focus,
      titleContext,
      termsNotIn(model, additions).join(" "),
      date ? model.dateOperator : "",
      orWords.length ? orGroup(orWords) : "",
      noise ? model.negative : "",
    ]);
  }

  function bingQuery(model, additions = []) {
    return joinParts([`site:${targetForum.domain}`, termsWith(model, additions).join(" "), model.negative]);
  }

  function forumQuery(model, additions = [], filters = [], options = {}) {
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

  function makeCard({ id, category, title, desc, priority, google, bing, forum = [], web, timeFiltered = true }) {
    const links = [];
    if (google) links.push(makeLink("Google 推荐", "google", google, true));
    if (bing) links.push(makeLink("Bing 备用", "bing", bing));
    for (const item of forum) {
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

  const baseCardFactories = [
    (model) =>
      makeCard({
        id: "precise-site",
        category: "precise",
        title: "全站不限时入口",
        desc: "先拿到最大召回面，适合不知道关键词是否新旧时使用。",
        priority: "P1",
        timeFiltered: false,
        google: googleQuery(model, [], { date: false }),
        bing: bingQuery(model),
        forum: [{ label: "L 站热度", query: forumQuery(model, [], ["order:likes"], { date: false }) }],
      }),
    (model) =>
      makeCard({
        id: "title-match",
        category: "title",
        title: "标题优先",
        desc: "适合找主题明确的教程、合集、工具贴。",
        priority: "P1",
        google: googleQuery(model, [], { title: true }),
        bing: bingQuery(model),
        forum: [{ label: "L 站标题", query: forumQuery(model, [], ["in:title", "order:latest"]) }],
      }),
    (model) =>
      makeCard({
        id: "tutorial-main",
        category: "tutorial",
        title: "教程和踩坑记录",
        desc: "优先找主楼信息完整、可照着做的帖子。",
        priority: "P2",
        google: googleQuery(model, [], { orWords: ["教程", "保姆级", "记录", "踩坑", "整理"] }),
        bing: bingQuery(model, ["教程"]),
        forum: [
          { label: "L 站教程", query: forumQuery(model, ["教程"], ["in:first", "order:likes"]) },
          { label: "L 站踩坑", query: forumQuery(model, ["踩坑"], ["in:first", "order:latest"]) },
        ],
      }),
    (model) =>
      makeCard({
        id: "issue-fix",
        category: "issue",
        title: "报错和解决方案",
        desc: "适合已经遇到错误、失效、配置失败的场景。",
        priority: model.intents.includes("排错") ? "P1" : "P2",
        google: googleQuery(model, [], { orWords: ["报错", "错误", "无法使用", "解决", "失效"] }),
        bing: bingQuery(model, ["报错"]),
        forum: [
          { label: "L 站报错", query: forumQuery(model, ["报错"], ["in:replies", "order:latest"]) },
          { label: "L 站解决", query: forumQuery(model, ["解决"], ["in:replies", "order:latest"]) },
        ],
      }),
    (model) =>
      makeCard({
        id: "tool-share",
        category: "tool",
        title: "工具和整合方案",
        desc: "适合找开源项目、脚本、一键包、替代工具。",
        priority: model.intents.includes("工具") ? "P1" : "P3",
        google: googleQuery(model, [], { orWords: ["开源", "分享", "推荐", "整合", "一键", "GitHub"] }),
        bing: bingQuery(model, ["工具"]),
        forum: [
          { label: "L 站开源", query: forumQuery(model, ["开源"], ["min_posts:5", "order:likes"]) },
          { label: "L 站推荐", query: forumQuery(model, ["推荐"], ["min_posts:5", "order:likes"]) },
          { label: "L 站整合", query: forumQuery(model, ["整合"], ["min_posts:5", "order:latest"]) },
        ],
      }),
    (model) =>
      makeCard({
        id: "config-env",
        category: "config",
        title: "环境和配置",
        desc: "专门找安装、配置文件、代理、环境变量相关内容。",
        priority: model.intents.includes("配置") ? "P1" : "P2",
        google: googleQuery(model, [], { orWords: ["配置", "安装", "环境变量", "代理", "config.toml", "settings.json"] }),
        bing: bingQuery(model, ["配置"]),
        forum: [
          { label: "L 站配置", query: forumQuery(model, ["配置"], ["in:first", "order:latest"]) },
          { label: "L 站代理", query: forumQuery(model, ["代理"], ["in:first", "order:latest"]) },
        ],
      }),
    (model) =>
      makeCard({
        id: "latest-feedback",
        category: "latest",
        title: "最新可用性反馈",
        desc: "适合信息变化快的 AI、API、账号、模型、插件问题。",
        priority: model.intents.includes("最新") ? "P1" : "P2",
        google: googleQuery(model, [], { orWords: model.comments ? ["可用", "失效", "替代", "更新", "反馈"] : [] }),
        bing: bingQuery(model, ["最新"]),
        forum: [
          { label: "L 站最新", query: forumQuery(model, [], ["order:latest"]) },
          { label: "L 站可用", query: forumQuery(model, ["可用"], ["in:replies", "order:latest"]) },
          { label: "L 站失效", query: forumQuery(model, ["失效"], ["in:replies", "order:latest"]) },
        ],
      }),
    (model) =>
      makeCard({
        id: "source-check",
        category: "source",
        title: "官网和原始线索",
        desc: "从 L 站讨论里找官网、文档、GitHub，再回到原始来源确认。",
        priority: "P2",
        google: googleQuery(model, [], { orWords: ["官网", "文档", "GitHub", "原始链接"] }),
        bing: bingQuery(model, ["官网"]),
        forum: [
          { label: "L 站官网", query: forumQuery(model, ["官网"], ["order:likes"]) },
          { label: "L 站 GitHub", query: forumQuery(model, ["GitHub"], ["order:likes"]) },
        ],
        web: joinParts([termsWith(model).join(" "), "official documentation GitHub docs"]),
      }),
  ];

  const specialRules = [
    {
      id: "ai-config-special",
      matcher: /codex|claude code|claude|cursor/i,
      build(model) {
        const extra = ["config.toml", "settings.json", "model_provider", "代理", "Windows", "WSL"];
        return makeCard({
          id: this.id,
          category: "config",
          title: "AI 编程工具配置",
          desc: "补上配置文件、模型供应商、代理这些高频限定词，自动去重。",
          priority: "P1",
          google: googleQuery(model, extra),
          bing: bingQuery(model, ["config.toml", "model_provider"]),
          forum: [
            { label: "L 站 config", query: forumQuery(model, ["config.toml"], ["in:first", "order:latest"]) },
            { label: "L 站模型", query: forumQuery(model, ["model_provider"], ["in:first", "order:latest"]) },
          ],
        });
      },
    },
    {
      id: "api-status-special",
      matcher: /api|中转|公益站|模型|openai|chatgpt/i,
      build(model) {
        return makeCard({
          id: this.id,
          category: "latest",
          title: "API 和中转状态",
          desc: "重点看评论区最近反馈，旧帖很可能已经变了。",
          priority: "P1",
          google: googleQuery(model, ["可用", "失效", "额度", "风控", "替代"]),
          bing: bingQuery(model, ["可用", "失效"]),
          forum: [
            { label: "L 站可用", query: forumQuery(model, ["可用"], ["in:replies", "order:latest"]) },
            { label: "L 站替代", query: forumQuery(model, ["替代"], ["in:replies", "order:latest"]) },
            { label: "L 站风控", query: forumQuery(model, ["风控"], ["in:replies", "order:latest"]) },
          ],
        });
      },
    },
    {
      id: "embedded-debug-special",
      matcher: /stm32|mfrc522|rc522|hal|cubemx/i,
      build(model) {
        const extra = ["STM32", "HAL", "CubeMX", "RC522", "MFRC522", "接线", "报错"];
        return makeCard({
          id: this.id,
          category: "issue",
          title: "嵌入式项目排错",
          desc: "把芯片、模块、HAL、CubeMX、接线和报错放在同一组里搜。",
          priority: "P1",
          google: googleQuery(model, extra),
          bing: bingQuery(model, ["HAL", "RC522", "报错"]),
          forum: [
            { label: "L 站 HAL", query: forumQuery(model, ["HAL", "报错"], ["in:first", "order:likes"]) },
            { label: "L 站接线", query: forumQuery(model, ["接线"], ["in:first", "order:likes"]) },
          ],
        });
      },
    },
  ];

  function buildCards(model) {
    if (!model.base && !model.looseBase) return [];
    const cards = baseCardFactories.map((factory) => factory(model));
    for (const rule of specialRules) {
      if (rule.matcher.test(model.searchText)) cards.push(rule.build(model));
    }
    return cards;
  }

  window.LinuxdoSearchCore = {
    config: {
      targetForum,
      quickTerms,
      stopWords,
      defaultNoiseWords,
      categoryLabels,
    },
    specialRules,
    buildModel,
    buildCards,
    compact,
    parseExcludeWords,
  };
})();
