# page-chat: Agent-to-Chatbot Pivot Design

**Date**: 2026-03-24
**Status**: Approved

## Summary

Pivot the `page-agent` project (a GUI agent that executes actions on web pages) into `page-chat` (a chatbot that reads web pages and answers questions). The chatbot lives in-page as a floating panel, reads the current page DOM, accepts local file uploads (text, PDF, images), takes viewport screenshots, and answers user questions via multi-turn streaming conversation.

## Requirements

- Pure client-side JavaScript — no server component
- Floating chat panel UI (same positioning concept as current agent panel)
- Reads current page DOM content (text-based extraction)
- Optional viewport screenshot for visual context (multimodal LLM)
- Local file uploads: text files, PDFs (parsed via pdf.js), images (sent as base64)
- Multi-turn conversation with streaming responses
- Markdown rendering in assistant responses
- Manual "refresh page" button to re-read DOM
- BYOLLM (bring your own LLM) — user provides model, baseURL, apiKey
- i18n support (en-US, zh-CN)
- One-line CDN integration + NPM package

## Architecture

### Package Structure

```
packages/
├── page-controller/    # Read-only DOM extraction (strip all actions)
├── llms/               # LLM client (add streaming support)
├── ui/                 # Chat bubble UI, file upload, markdown rendering
├── core/               # PageChatCore (replaces PageAgentCore)
├── page-chat/          # Main entry (rename from page-agent)
├── website/            # Docs (update for chatbot)
└── extension/          # Deferred
```

### Core Chat Flow

```
User types question
        │
        ▼
PageChatCore.sendMessage(text)
        │
        ├── Assemble messages:
        │   1. System prompt (instructions)
        │   2. Page context (simplified HTML from PageController)
        │   3. Viewport screenshot (optional, base64)
        │   4. Attachment contents (files uploaded by user)
        │   5. Conversation history (all previous turns)
        │   6. Current user message
        │
        ▼
LLM.stream(messages) → AsyncIterable<string>
        │
        ▼
UI renders streaming tokens as markdown
```

### PageChatCore

Replaces PageAgentCore. No agent loop, no tools, no MacroTool.

```typescript
class PageChatCore extends EventTarget {
    messages: ChatMessage[]
    pageContent: string | null
    attachments: Attachment[]

    async sendMessage(text: string, signal?: AbortSignal): AsyncIterable<string>
    async refreshPage(): void
    addAttachment(file: File): void
    removeAttachment(id: string): void
    clear(): void
}
```

### Message Assembly

Each `sendMessage` builds the full message array sent to the LLM:

1. **System message**: "You are a helpful assistant. Answer questions based on the provided page content and attached documents."
2. **Page context**: `<browser_state>` from PageController — URL, title, simplified HTML with indexed interactive elements.
3. **Screenshot**: If enabled, viewport screenshot as base64 image content.
4. **Attachments**: Each file's content with filename labels. Images as base64 multimodal content.
5. **Conversation history**: All previous user/assistant pairs.
6. **User message**: The new question.

### Streaming

New `stream()` method on the LLM client alongside existing `invoke()`. For OpenAI-compatible APIs: set `stream: true`, read Server-Sent Events. Returns `AsyncIterable<string>` of text chunks.

### File Handling

| File Type | Processing |
|-----------|-----------|
| Text (.txt, .md, .csv, .json, .js, etc.) | `FileReader.readAsText()` → UTF-8 string |
| PDF (.pdf) | `pdfjs-dist` (Mozilla pdf.js) → extract text per page |
| Images (.png, .jpg, .gif, .webp) | `FileReader.readAsDataURL()` → base64, sent as multimodal image content |

### Page Visual Context

Take a viewport screenshot using `html2canvas` instead of extracting individual `<img>` elements:
- Simpler and more reliable (no CORS issues)
- Captures everything visible: CSS backgrounds, canvas, SVGs, icons
- Sent alongside text extraction — LLM gets both structural text and visual layout
- Optional/configurable (`enableScreenshot`) since it increases token usage and requires multimodal LLM

## UI Design

### Panel Layout

```
┌─────────────────────────────┐
│ 💬 Page Chat     [🔄][−][×] │  Header: refresh page, minimize, close
├─────────────────────────────┤
│                             │
│  ┌─────────────────────┐    │
│  │ User: What does     │    │  User bubble (right-aligned)
│  │ this page do?       │    │
│  └─────────────────────┘    │
│                             │
│  ┌─────────────────────┐    │
│  │ Assistant: This page│    │  Assistant bubble (left, markdown)
│  │ is a documentation  │    │
│  │ site that...        │    │
│  └─────────────────────┘    │
│                             │
├─────────────────────────────┤
│ 📎 doc.pdf  🖼️ chart.png   │  Attachment chips (removable)
├─────────────────────────────┤
│ [📎][📷] Type message...[→]│  Input: attach, screenshot, text, send
└─────────────────────────────┘
```

### UI Elements

- **Chat history**: Scrollable area with user/assistant bubbles. Assistant renders markdown.
- **Input bar**: Text input (Enter to send). Buttons for file upload and screenshot.
- **Attachment chips**: Show files above input. Remove button on each.
- **Refresh button**: In header. Re-reads page DOM. Shows last-read timestamp.
- **Streaming indicator**: Typing indicator / partial text while assistant generates.

### Technology

- **Markdown**: `marked` (~30KB) for rendering assistant messages
- **PDF parsing**: `pdfjs-dist` for uploaded PDFs
- **Screenshot**: `html2canvas` for viewport capture
- **UI rendering**: Vanilla TS/DOM (consistent with existing codebase), shadow DOM isolated

## Removal Plan

### page-controller

**Remove**: `clickElement`, `inputText`, `selectOption`, `scroll`, `scrollHorizontally`, `executeJavascript`, `showMask`, `hideMask` from `src/PageController.ts`; entire `src/actions.ts`; entire `src/mask/` directory (contains `SimulatorMask.ts`)

**Keep**: DOM extraction (`getFlatTree`, `flatTreeToString`, `getBrowserState`, `getPageInfo`), highlight indexing

### core

**Remove**: `PageAgentCore`, agent loop, MacroTool, all tools, reflection-before-action types, step history, agent system prompts

**Add**: `PageChatCore` with `sendMessage`, conversation history, attachment management

### llms

**Remove**: Tool-call-only response parsing (keep as fallback path)

**Keep**: `LLM` wrapper, `OpenAIClient`, retry logic, model patches

**Add**: Streaming support (`stream: true` + SSE parsing), text-response path (no tool calls)

### ui

**Remove**: Step/action cards, reflection rendering, agent activity events

**Keep**: Panel shell (positioning, expand/collapse, shadow DOM)

**Add**: Chat bubble rendering, file upload UI, markdown display, screenshot button

### page-agent → page-chat

**Remove**: `PageAgent` class

**Add**: `PageChat` class composing `PageChatCore` + Panel

## Public API

```typescript
import { PageChat } from 'page-chat'

const chat = new PageChat({
    model: 'gpt-4o',
    baseURL: 'https://api.openai.com/v1',
    apiKey: 'sk-...',
    language: 'en-US',
    enableScreenshot: true,
    systemPrompt: 'Custom instructions...',
})

chat.panel.show()
chat.panel.hide()
chat.sendMessage('What does this page do?')
chat.refreshPage()
chat.addFile(file)
chat.clear()
chat.dispose()
```

### Configuration

```typescript
interface PageChatConfig {
    model: string
    baseURL: string
    apiKey: string
    language?: 'en-US' | 'zh-CN'
    enableScreenshot?: boolean           // Default: false
    systemPrompt?: string                // Override default
    maxConversationTurns?: number        // Limit history for token management
    transformPageContent?: (content: string) => string
}
```

### One-Line CDN Integration

```html
<script src="https://cdn.jsdelivr.net/npm/page-chat@latest/dist/iife/page-chat.demo.js" crossorigin="true"></script>
```

## Task Breakdown

### Task 1: Strip page-controller to read-only

**Files**: `packages/page-controller/src/PageController.ts`, `packages/page-controller/src/actions.ts`, `packages/page-controller/src/mask/SimulatorMask.ts`, `packages/page-controller/src/index.ts`

- Remove action methods from `PageController.ts`: `clickElement`, `inputText`, `selectOption`, `scroll`, `scrollHorizontally`, `executeJavascript`, `showMask`, `hideMask`
- Delete `src/actions.ts` entirely
- Delete `src/mask/` directory entirely
- Remove action-related imports and exports from `src/index.ts`
- Keep: `updateTree`, `getBrowserState`, `getPageInfo`, `getFlatTree`, `flatTreeToString`, DOM extraction pipeline, highlight indexing
- Update `package.json` if any action-only dependencies exist

**QA**: Run `npm run build` in page-controller workspace. Verify `getBrowserState()` returns valid content. Run `npm run lint`. No type errors on remaining exports.

### Task 2: Add streaming support to LLMs package

**Files**: `packages/llms/src/OpenAIClient.ts`, `packages/llms/src/index.ts`, `packages/llms/src/types.ts`

- Add `stream()` method to `OpenAIClient` that sets `stream: true` in the request body and parses SSE `data:` lines from the response
- Add `stream()` method to `LLM` wrapper class that delegates to client with retry logic
- Add types: `StreamOptions`, update `LLMClient` interface with `stream` method signature
- Add text-response path (no tool_choice, no tool_call parsing) for when no tools are provided
- Return `AsyncIterable<string>` yielding text delta chunks

**QA**: Unit test — mock fetch returning SSE stream with `data: {"choices":[{"delta":{"content":"hello"}}]}` lines. Verify `stream()` yields `"hello"`. Verify `stream()` handles `data: [DONE]` termination. Verify text-response path returns assistant content when no tools given. Run `npm run build` and `npm run lint`.

### Task 3: Implement PageChatCore

**Files**: `packages/core/src/PageChatCore.ts` (new), `packages/core/src/types.ts` (rewrite), `packages/core/src/index.ts`, `packages/core/src/prompts/` (new system prompt)

- Create `PageChatCore` extending `EventTarget` with:
    - `messages: ChatMessage[]` — conversation history
    - `pageContent: string | null` — last page snapshot
    - `pageScreenshot: string | null` — last viewport screenshot (base64)
    - `attachments: Attachment[]` — uploaded files
    - `sendMessage(text, signal?)` → `AsyncIterable<string>` — assembles messages, calls `llm.stream()`, yields chunks, appends full response to history
    - `refreshPage()` — calls `pageController.getBrowserState()`, stores content
    - `addAttachment(file: File)` — reads file via FileReader (text/base64), stores parsed content
    - `removeAttachment(id)`, `clear()`, `dispose()`
- Message assembly logic: system prompt + page context + screenshot + attachments + history + user message
- New system prompt for chat mode (in `src/prompts/`)
- Define `ChatMessage`, `Attachment`, `PageChatConfig` types
- Remove: `PageAgentCore`, `MacroTool`, tools, agent loop, reflection types, step history

**QA**: Unit test — mock PageController returning fake browser state, mock LLM stream. Call `sendMessage("test")`, collect chunks, verify full response in `messages` array. Verify `refreshPage()` updates `pageContent`. Verify `addAttachment()` with a text file stores content. Run `npm run build` and `npm run lint`.

### Task 4: Implement chat Panel UI

**Files**: `packages/ui/src/panel/Panel.ts` (rewrite), `packages/ui/src/panel/cards.ts` (rewrite → chat bubbles), `packages/ui/src/panel/Panel.module.css` (rewrite), `packages/ui/src/panel/types.ts` (update adapter interface), `packages/ui/src/i18n/locales.ts` (update strings)

- Rewrite `PanelChatAdapter` interface: `sendMessage(text)`, `refreshPage()`, `addFile(file)`, `removeAttachment(id)`, `attachments`, `messages`, `stop()`, `dispose()` + events: `messagechange`, `statuschange`
- Rewrite Panel interior:
    - Chat history area with user (right) and assistant (left) bubbles
    - Streaming: assistant bubble grows as chunks arrive
    - Markdown rendering via `marked` for assistant messages
    - File upload button (📎) triggering hidden `<input type="file">` accepting `.txt,.md,.csv,.json,.js,.ts,.pdf,.png,.jpg,.gif,.webp`
    - Screenshot button (📷) that calls adapter method
    - Attachment chips bar above input (filename + type icon + remove ×)
    - Refresh page button (🔄) in header
    - Input bar: textarea (Enter to send, Shift+Enter for newline) + send button
- Update i18n locales with new strings (en-US, zh-CN)
- Add `marked` as dependency to `packages/ui/package.json`

**QA**: Build UI package (`npm run build` in ui workspace). Manual test: mount Panel with a mock adapter, verify chat bubbles render, file upload triggers adapter, markdown renders in assistant messages, streaming text appears incrementally. Run `npm run lint`.

### Task 5: Implement PageChat entry class

**Files**: `packages/page-chat/src/PageChat.ts` (new, replaces PageAgent.ts), `packages/page-chat/src/demo.ts` (update), `packages/page-chat/package.json` (rename)

- Create `PageChat` class composing `PageChatCore` + `PageController` + `Panel`
- Wire Panel events to PageChatCore methods
- Expose public API: `panel`, `sendMessage()`, `refreshPage()`, `addFile()`, `clear()`, `dispose()`
- Update demo.ts for chatbot initialization
- Rename npm package from `page-agent` to `page-chat` in package.json
- Update IIFE build entry for CDN usage

**QA**: `npm run build` succeeds for all packages. Demo IIFE loads in a browser page, panel opens, user can type a message. Run `npm run lint`. Verify CDN-style `<script>` tag integration works via demo build.

### Task 6: Add file parsing dependencies

**Files**: `packages/core/package.json` or `packages/ui/package.json`, file parsing utilities

- Add `pdfjs-dist` for PDF text extraction
- Add `html2canvas` for viewport screenshots
- Add `marked` for markdown rendering (in ui package)
- Create utility functions:
    - `parsePDF(file: File): Promise<string>` — extract text from PDF pages
    - `captureScreenshot(): Promise<string>` — returns base64 data URL of viewport
    - `parseTextFile(file: File): Promise<string>` — read text file as UTF-8
    - `readImageFile(file: File): Promise<string>` — read image as base64 data URL

**QA**: Unit test `parsePDF` with a small test PDF. Unit test `parseTextFile` with a .txt file. Verify `captureScreenshot` returns a valid base64 string (integration test in browser). Run `npm run build` and `npm run lint`.

### Task 7: Rename project and update configs

**Files**: Root `package.json`, `AGENTS.md`, `README.md`, tsconfig files, workspace configs, `packages/page-agent/` directory

- Rename `packages/page-agent/` directory to `packages/page-chat/`
- Update all workspace references in root `package.json`
- Update tsconfig references
- Update `AGENTS.md` to reflect new architecture
- Update `README.md` with new project name and usage examples

**QA**: `npm install` succeeds. `npm run build` succeeds across all workspaces. `npm run lint` passes. No broken imports or references.

## QA Scenarios (End-to-End)

### QA-1: Basic chat flow
1. Open demo page with `<script>` tag integration
2. Panel appears as floating widget
3. Type "What is this page about?" and press Enter
4. User bubble appears right-aligned
5. Assistant bubble appears left-aligned with streaming text
6. Response renders markdown (bold, lists, code blocks)
7. **Pass**: Both bubbles visible, markdown rendered, response references page content

### QA-2: File upload
1. Click 📎 button in input bar
2. Select a .txt file from local filesystem
3. Attachment chip appears above input with filename
4. Ask "Summarize the uploaded file"
5. **Pass**: Assistant response references file content accurately

### QA-3: PDF upload
1. Upload a .pdf file
2. Attachment chip shows PDF icon + filename
3. Ask a question about PDF content
4. **Pass**: Assistant answers based on extracted PDF text

### QA-4: Image upload
1. Upload a .png image
2. Ask "What's in this image?"
3. **Pass**: If LLM is multimodal, describes image. If not, graceful error message.

### QA-5: Page screenshot
1. Click 📷 button
2. Ask "Describe what you see on this page"
3. **Pass**: Assistant describes visual layout (requires multimodal LLM)

### QA-6: Refresh page
1. Navigate to a different section of the page (scroll, click link)
2. Click 🔄 refresh button in header
3. Ask about newly visible content
4. **Pass**: Assistant answers based on updated page content

### QA-7: Multi-turn conversation
1. Ask "What is the main heading?"
2. Follow up: "What links are under it?"
3. Follow up: "Summarize all of that"
4. **Pass**: Each response is contextually aware of previous turns

### QA-8: i18n
1. Initialize with `language: 'zh-CN'`
2. **Pass**: All UI strings (placeholder, buttons, labels) appear in Chinese

### QA-9: Abort/stop
1. Send a message
2. While streaming, click stop button
3. **Pass**: Streaming stops, partial response preserved in chat history

## What Stays the Same

- One-line integration via CDN script tag (IIFE build)
- NPM package for programmatic use
- Shadow DOM isolation for the panel
- i18n (en-US, zh-CN)
- BYOLLM model
- Monorepo structure with npm workspaces
- TypeScript + Vite build system
