# Linux.do Search Tool

一个面向 [linux.do](https://linux.do) 的搜索入口生成器。它把你输入的问题拆成多组更容易命中的搜索式，并按教程、排错、配置、工具、最新反馈和溯源等场景分类。

## 功能

- 自动生成 Google、Bing 和 Linux.do 站内搜索链接。
- 按“全站、标题、教程、排错、工具、配置、最新、溯源”分类搜索卡片。
- 支持时间范围、精确短语、排除水帖和评论反馈筛选。
- 内置常用限定词，例如 Codex、Claude Code、OpenAI API、config.toml、WSL、STM32。
- 提供优先入口、搜索记录和个人检索清单。
- 纯静态页面，本地运行即可使用，不需要后端服务。

## 使用方式

直接打开 `index.html`，输入你想找的问题，例如：

```text
Claude Code Windows 配置
```

也可以补充环境或限定词：

```text
config.toml WSL 代理
```

页面会生成多张搜索卡。建议优先使用 `Google 推荐`，再根据需要使用 `Bing 备用` 或 `L 站内搜`。

## 版本

- 桌面版：`index.html`
- 手机优化版：`mobile/index.html`

## 搜索策略

这个工具融合了几种常用方法：

- `site:linux.do`：用搜索引擎定位 linux.do 内容。
- `intitle:`：优先找标题命中的主题帖。
- `after:YYYY-MM-DD`：过滤较新的内容。
- Discourse 站内语法：如 `in:title`、`in:first`、`in:replies`、`order:latest`、`order:likes`。
- 评论反馈词：如“可用、失效、替代、更新、反馈”，适合 AI、API、账号和工具类信息。

## 实测建议

- Google 入口通常最稳，适合作为第一搜索入口。
- Bing 可作为备用，但有时会出现验证挑战。
- Linux.do 站内搜索可能先显示“请稍候”，如果等待后仍不出结果，建议回到 Google 入口。

## 隐私

项目是纯前端静态页面。搜索记录保存在浏览器本地 `localStorage` 中，不会上传到服务器。
