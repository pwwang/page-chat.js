# Page Chat

<p align="center">
  <img alt="Page Chat Logo" src="../logo.svg" width="120" height="120" />
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-auto.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/) [![Bundle Size](https://img.shields.io/bundlephobia/minzip/page-chat)](https://bundlephobia.com/package/page-chat) [![Downloads](https://img.shields.io/npm/dt/page-chat.svg)](https://www.npmjs.com/package/page-chat) [![GitHub stars](https://img.shields.io/github/stars/alibaba/page-chat.svg)](https://github.com/alibaba/page-chat)

基于 **[page-agent.js](https://www.npmjs.com/package/page-agent)** 构建的轻量级页面内聊天机器人。向 AI 询问当前页面内容、附加文件，支持任意 AI 模型，无需 function/tool calling。

🌐 [English](../README.md) | **中文**

<a href="https://alibaba.github.io/page-chat/" target="_blank"><b>🚀 Demo</b></a> | <a href="https://alibaba.github.io/page-chat/docs/introduction/overview" target="_blank"><b>📖 Docs</b></a> | <a href="https://news.ycombinator.com/item?id=47264138" target="_blank"><b>📢 HN Discussion</b></a> | <a href="https://x.com/simonluvramen" target="_blank"><b>𝕏 Follow on X</b></a>

<video id="demo-video" src="https://github.com/user-attachments/assets/a1f2eae2-13fb-4aae-98cf-a3fc1620a6c2" controls crossorigin muted></video>

---

## ✨ Features

- **🎯 轻松集成**
    - 无需 `浏览器插件` / `Python` / `无头浏览器`，纯页面内 JavaScript
- **🧠 兼容任意 AI 模型**
    - 无需 function/tool calling，兼容所有 OpenAI 兼容接口
- **📖 页面感知对话**
    - 自动读取当前页面内容，让 AI 回答页面上的问题
- **📎 文件与截图附件**
    - 可附加本地文件或截屏作为对话上下文
- **🔌 基于 page-agent.js**
    - 共用同一套经过验证的 DOM 提取引擎，以更简单的纯聊天界面对外提供

## 💡 应用场景

- **SaaS AI Copilot** — 几行代码为你的产品加上 AI 助手，无需重写后端。
- **页面问答** — 让用户用自然语言询问当前页面的内容。
- **文档对话** — 附加 PDF、图片或文本文件，与 AI 进行讨论。
- **无障碍增强** — 用自然语言让任何网页无障碍。语音指令、屏幕阅读器，零门槛。

## 🚀 快速开始

### 一行代码集成

通过我们免费的 Demo LLM 快速体验 PageChat：

```html
<script src="{URL}" crossorigin="true"></script>
```

> **⚠️ 仅用于技术评估。** 该 Demo CDN 使用了免费的[测试 LLM API](https://alibaba.github.io/page-chat/docs/features/models#free-testing-api)，使用即表示您同意其[条款](https://github.com/alibaba/page-chat/blob/main/docs/terms-and-privacy.md)。

| Mirrors | URL                                                                              |
| ------- | -------------------------------------------------------------------------------- |
| Global  | https://cdn.jsdelivr.net/npm/page-chat@0.0.3/dist/iife/page-chat.demo.js         |
| China   | https://registry.npmmirror.com/page-chat/0.0.3/files/dist/iife/page-chat.demo.js |

### NPM 安装

```bash
npm install page-chat
```

```javascript
import { PageChat } from 'page-chat'

const chat = new PageChat({
    model: 'qwen3.5-plus',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: 'YOUR_API_KEY',
    language: 'zh-CN',
    title: '我的助手', // 可选 — 自定义聊天面板标题
})
```

更多编程用法，请参阅 [📖 文档](https://alibaba.github.io/page-chat/docs/introduction/overview).

## 🤝 贡献

欢迎社区贡献！请参阅 [CONTRIBUTING.md](../CONTRIBUTING.md) 了解安装与贡献指南。

提交 issue 或 PR 之前，请先阅读[维护者说明](https://github.com/alibaba/page-chat/issues/349)和[行为准则](CODE_OF_CONDUCT.md)。

我们不接受未经实质性人类参与、完全由 Bot 或 Agent 自动生成的代码，机器人账号可能被禁止参与互动。

## 👏 致谢

`page-chat` 基于 **[`page-agent.js`](https://www.npmjs.com/package/page-agent)** 构建 — 一个面向浏览器的完整 GUI 自动化 Agent。`page-chat` 复用了其 DOM 提取引擎与页面读取基础设施，去掉了自动化操作层，以更简单的聊天界面对外提供，并支持所有 AI 模型，包括不具备 function/tool calling 能力的模型。

底层 DOM 处理组件最初源自 **[`browser-use`](https://github.com/browser-use/browser-use)**。

```
DOM processing components and prompt are derived from browser-use:

Browser Use <https://github.com/browser-use/browser-use>
Copyright (c) 2024 Gregor Zunic
Licensed under the MIT License

We gratefully acknowledge the browser-use project and its contributors for their
excellent work on web automation and DOM interaction patterns that helped make
this project possible.

Third-party dependencies and their licenses can be found in the package.json
file and in the node_modules directory after installation.
```

## 📄 许可证

[MIT License](../LICENSE)

---

**⭐ 如果觉得 PageChat 有用或有趣，请给项目点个星！**

<a href="https://www.star-history.com/?repos=alibaba%2Fpage-chat&type=date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=alibaba/page-agent&type=date&theme=dark&legend=top-left&v=7" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=alibaba/page-agent&type=date&legend=top-left&v=7" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=alibaba/page-agent&type=date&legend=top-left&v=7" />
 </picture>
</a>
