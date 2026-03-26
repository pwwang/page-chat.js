# Page Chat

<p align="center">
  <img alt="Page Chat Logo" src="./logo.svg" width="120" height="120" />
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-auto.svg)](https://opensource.org/licenses/MIT) [![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

The lightweight in-page chatbot, built on top of **[page-agent.js](https://www.npmjs.com/package/page-agent)**. Ask questions about the current page, attach files, and chat with any AI model — no function/tool calling required.

---

## ✨ Features

- **🎯 Easy integration**
    - No need for `browser extension` / `python` / `headless browser`.
    - Just in-page JavaScript. Everything happens in your web page.
- **🧠 Works with any AI model**
    - No function/tool calling required — compatible with every OpenAI-compatible endpoint.
- **📖 Page-aware chat**
    - Reads the current page content so the AI can answer questions about what's on screen.
- **📎 File & screenshot attachments**
    - Attach local files or capture a screenshot as context for the conversation.
- **🔌 Built on page-agent.js**
    - Shares the same battle-tested DOM extraction engine, packaged as a simpler chat-only interface.

## 💡 Use Cases

- **SaaS AI Copilot** — Ship an AI assistant in your product in lines of code. No backend rewrite.
- **Page Q&A** — Let users ask questions about the current page content in plain language.
- **Document Chat** — Attach PDFs, images, or text files and discuss them with the AI.
- **Accessibility** — Make any web app accessible through natural language. Voice commands, screen readers, zero barrier.

## 🚀 Quick Start

### One-line integration

Fastest way to try PageChat with our free Demo LLM:

```html
<script src="{URL}" crossorigin="true"></script>
```

```bash
# Run the demo server locally (requires Node.js)
git clone https://github.com/pwwang/page-chat.git
cd page-chat/
npm install
# Change the API endpoint in packages/page-chat/src/demo.ts if needed, then run:
npm run dev:demo
```

### NPM Installation

```bash
npm install page-chat
```

```javascript
import { PageChat } from 'page-chat'

const chat = new PageChat({
    model: 'qwen3.5-plus',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: 'YOUR_API_KEY',
    language: 'en-US',
    persist: true, // optional, enable conversation history persistence across page reloads
    title: 'My Assistant', // optional — customises the chat panel title
})
```

For more programmatic usage, see [📖 Documentations](https://alibaba.github.io/page-chat/docs/introduction/overview).

## 🤝 Contributing

We welcome contributions from the community! Follow our instructions in [CONTRIBUTING.md](CONTRIBUTING.md) for setup and guidelines.

Please read the [maintainer note](https://github.com/alibaba/page-chat/issues/349) and [Code of Conduct](docs/CODE_OF_CONDUCT.md) before opening issues or PRs.

Contributions generated entirely by **bots or agents** without substantial human involvement will **not be accepted**.

## 👏 Acknowledgments

`page-chat` is built on top of **[`page-agent.js`](https://www.npmjs.com/package/page-agent)**, a full GUI automation agent for the browser. `page-chat` takes the same DOM extraction engine and page-reading infrastructure, strips out the automation layer, and exposes it as a simple chat interface that works with any AI model — including those without function/tool calling support.

The underlying DOM processing components were originally derived from **[`browser-use`](https://github.com/browser-use/browser-use)**.

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

## 📄 License

[MIT License](LICENSE)

---
