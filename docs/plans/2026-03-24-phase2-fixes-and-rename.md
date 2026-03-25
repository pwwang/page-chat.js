# Phase 2: Bug Fixes, Hardening, and Rename Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 3 critical bugs, 7 important issues, and complete the `page-agent` → `page-chat` rename across 29 files identified in Phase 1 code review.

**Architecture:** Fixes are grouped into independent tasks by concern: XSS sanitization, streaming UI race condition, stop/dispose wiring, history algorithm, attachment events, page context enrichment, error handling, build entry, and rename sweep. Each task is self-contained and verifiable.

**Tech Stack:** TypeScript, Vite, CSS Modules, DOMPurify, marked

---

## Task 1: XSS — Sanitize markdown output with DOMPurify (Critical)

**Problem:** `marked.parse()` output is injected via `innerHTML` in `cards.ts` (line 16) and `Panel.ts` (line 262) without sanitization. Any user-controlled markdown or LLM-generated content can execute arbitrary scripts.

**Files:**

- Modify: `packages/ui/package.json` — add `dompurify` dependency
- Modify: `packages/ui/src/panel/cards.ts:14-21` — sanitize assistant bubble
- Modify: `packages/ui/src/panel/Panel.ts:262` — sanitize streaming content

**Step 1: Add DOMPurify dependency**

```bash
npm install dompurify --workspace=@page-chat/ui
```

**Step 2: Sanitize `createAssistantBubble` in cards.ts**

Replace lines 1-21 of `packages/ui/src/panel/cards.ts` with:

```typescript
import type { Attachment, ChatMessage } from '@page-chat/core'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

import { escapeHtml } from '../utils'

export function createUserBubble(message: ChatMessage): string {
    return `
		<div class="message user">
			<div class="content">${escapeHtml(message.content)}</div>
		</div>
	`
}

export function createAssistantBubble(message: ChatMessage): string {
    const rawHtml = marked.parse(message.content) as string
    const content = DOMPurify.sanitize(rawHtml)
    return `
		<div class="message assistant">
			<div class="content markdown-body">${content}</div>
		</div>
	`
}
```

**Step 3: Sanitize streaming content in Panel.ts**

Add DOMPurify import to `packages/ui/src/panel/Panel.ts` line 1:

```typescript
import DOMPurify from 'dompurify'
import { marked } from 'marked'
```

Replace line 262 (`contentArea.innerHTML = marked.parse(...)`) with:

```typescript
contentArea.innerHTML = DOMPurify.sanitize(marked.parse(accumulatedResponse) as string)
```

**Step 4: Verify**

```bash
npm run build --workspace=@page-chat/ui
npx eslint packages/ui/
```

Expected: Build succeeds, no lint errors.

---

## Task 2: Fix streaming UI race condition (Critical)

**Problem:** When `Core.sendMessage` pushes the user message (line 172), it dispatches `messagechange` synchronously. The event chain `Core → PageChat → Panel.#onMessageChange → #renderMessages → chatArea.innerHTML = ...` wipes the streaming bubble that `#handleSend` just appended (or is about to append). The fix: guard `#onMessageChange` to skip `#renderMessages` while streaming is in progress (`this.#abortController != null`).

**Files:**

- Modify: `packages/ui/src/panel/Panel.ts:41` — guard the event handler

**Step 1: Guard `#onMessageChange` against streaming wipe**

Replace line 41 of `packages/ui/src/panel/Panel.ts`:

```typescript
// OLD:
#onMessageChange = () => this.#renderMessages()

// NEW:
#onMessageChange = () => {
	// During streaming, #handleSend manages the streaming bubble directly.
	// Full re-render would wipe the streaming bubble. Wait for finally{} block.
	if (this.#abortController) return
	this.#renderMessages()
}
```

**Step 2: Ensure user bubble renders before streaming starts**

In `#handleSend`, add a `#renderMessages()` call after clearing the textarea but BEFORE creating the streaming bubble. This renders the just-dispatched user message. Replace lines 239-254 of Panel.ts:

```typescript
async #handleSend(): Promise<void> {
	const text = this.#textarea.value.trim()
	if (!text && this.#adapter.attachments.length === 0) return

	this.#textarea.value = ''
	this.#adjustTextareaHeight()

	this.#abortController = new AbortController()
	const stream = this.#adapter.sendMessage(text, this.#abortController.signal)

	// Render messages (including the new user message just pushed by Core)
	this.#renderMessages()

	const streamingBubbleHTML = createStreamingBubble()
	const tempDiv = document.createElement('div')
	tempDiv.innerHTML = streamingBubbleHTML
	const streamingBubble = tempDiv.firstElementChild as HTMLElement
	this.#chatArea.appendChild(streamingBubble)
	this.#scrollToBottom()
```

Note: `this.#abortController` is set BEFORE calling `sendMessage`, so the guard works. But `sendMessage` dispatches `messagechange` synchronously during its execution. The flow is:

1. `#handleSend` sets `this.#abortController` (line ~246)
2. `#handleSend` calls `adapter.sendMessage(text, signal)` — Core synchronously pushes user message + dispatches `messagechange`
3. Event fires → `#onMessageChange` → guard sees `this.#abortController` is set → returns (no wipe)
4. `#handleSend` explicitly calls `#renderMessages()` to render user bubble
5. Appends streaming bubble
6. Iterates async chunks
7. Finally block: clears `#abortController`, removes streaming bubble, calls `#renderMessages()`

**Step 3: Verify**

```bash
npm run build --workspace=@page-chat/ui
```

Expected: Build succeeds.

---

## Task 3: Scope `:global()` CSS selectors (Critical)

**Problem:** Panel CSS uses `:global(.message)`, `:global(.chip)`, `:global(.markdown-body)` selectors that leak into the host page. Any element with class `message`, `chip`, or `markdown-body` on the page would be styled.

**Fix:** Prefix all `:global()` selectors with `.chatArea` or `.attachmentsBar` parent (which ARE scoped via CSS modules). This keeps them page-chat-specific without Shadow DOM.

**Files:**

- Modify: `packages/ui/src/panel/Panel.module.css:166-233` — scope `.message` under `.chatArea`
- Modify: `packages/ui/src/panel/Panel.module.css:265-289` — scope `.chip` under `.attachmentsBar`

**Step 1: Scope message selectors**

Replace line 166 (`:global(.message) {`) with:

```css
.chatArea :global(.message) {
```

This scopes `.message` to only match inside `.chatArea` (which is a CSS module class, already hashed).

**Step 2: Scope chip selectors**

Replace line 265 (`:global(.chip) {`) with:

```css
.attachmentsBar :global(.chip) {
```

**Step 3: Verify**

```bash
npm run build --workspace=@page-chat/ui
```

Expected: Build succeeds, CSS output shows scoped selectors.

---

## Task 4: Wire stop() and abort-on-dispose (Important)

**Problem:** `PageChat.stop()` is a no-op (line 79). `PageChat.dispose()` doesn't abort in-flight streams. If a user calls `dispose()` during streaming, the async generator keeps running.

**Files:**

- Modify: `packages/page-chat/src/PageChat.ts:79` — implement stop
- Modify: `packages/page-chat/src/PageChat.ts:85-90` — abort in dispose
- Modify: `packages/ui/src/panel/types.ts` — no changes needed (stop() already in interface)

**Step 1: Add AbortController tracking to PageChat**

In `packages/page-chat/src/PageChat.ts`, add a field and modify `sendMessage` and `stop`:

```typescript
export class PageChat extends EventTarget implements PanelChatAdapter {
	readonly panel: Panel
	readonly core: PageChatCore
	readonly config: PageChatCore['config']

	#currentAbortController: AbortController | null = null

	// ... constructor stays the same ...

	sendMessage(text: string, signal?: AbortSignal): AsyncGenerator<string, void, unknown> {
		// Track the signal's controller for stop/dispose
		this.#currentAbortController = signal ? null : new AbortController()
		const effectiveSignal = signal ?? this.#currentAbortController!.signal
		return this.core.sendMessage(text, effectiveSignal)
	}

	stop(): void {
		this.#currentAbortController?.abort()
		this.#currentAbortController = null
	}

	dispose(): void {
		this.stop()
		this.panel.dispose()
		this.core.removeEventListener('messagechange', this.#onMessageChange)
		this.core.removeEventListener('statuschange', this.#onStatusChange)
		this.core.dispose()
	}
```

Wait — Panel already creates its own AbortController and passes the signal to `adapter.sendMessage(text, signal)`. So `PageChat.sendMessage` always receives a signal from Panel. The `stop()` on PageChat is called by Panel's stop button handler (line 184: `this.#adapter.stop()`). But Panel also calls `this.#abortController?.abort()` on the same line.

So the real question: is `PageChat.stop()` ever called independently of Panel? Yes — a programmatic user might call `pageChat.stop()` directly without Panel. In that case, we need PageChat to track the controller.

But since Panel always passes its own signal, and Panel already aborts it, `PageChat.stop()` only matters for direct API usage. Let's track the controller in PageChat but respect the Panel-provided signal.

Actually, simpler approach: Panel calls `this.#abortController?.abort()` AND `this.#adapter.stop()`. So `stop()` is redundant when Panel drives. But for programmatic API, let's still wire it:

```typescript
sendMessage(text: string, signal?: AbortSignal): AsyncGenerator<string, void, unknown> {
	const controller = new AbortController()
	this.#currentAbortController = controller

	// If external signal aborts, propagate to our controller
	if (signal) {
		signal.addEventListener('abort', () => controller.abort(), { once: true })
	}

	return this.core.sendMessage(text, controller.signal)
}

stop(): void {
	this.#currentAbortController?.abort()
	this.#currentAbortController = null
}
```

**Step 2: Verify**

```bash
npm run build --workspace=page-chat
npx eslint packages/page-chat/
```

Expected: Build succeeds.

---

## Task 5: Fix history turn-limiting algorithm (Important)

**Problem:** `#limitHistoryByTurns` counts assistant messages backwards and slices from `startIndex`. If history is `[user, assistant, user, assistant, user]` with `maxTurns=1`, it finds the last assistant at index 3, sets `startIndex=3`, returns `[assistant, user]` — orphaning the user message that preceded it.

**Fix:** When slicing, include the user message that precedes the cut point.

**Files:**

- Modify: `packages/core/src/PageChatCore.ts:88-106`

**Step 1: Fix the slicing algorithm**

Replace lines 88-106:

```typescript
#limitHistoryByTurns(history: ChatMessage[]): ChatMessage[] {
	const maxTurns = this.config.maxConversationTurns
	if (!maxTurns || maxTurns <= 0) return history

	// Count conversation turns (user+assistant pairs) from the end
	let turnCount = 0
	let startIndex = history.length

	for (let index = history.length - 1; index >= 0; index--) {
		if (history[index].role === 'assistant') {
			turnCount++
			if (turnCount > maxTurns) break
		}
		startIndex = index
	}

	return history.slice(startIndex)
}
```

This traverses backwards, counting assistant messages as turn boundaries. `startIndex` is updated on every step, so it always points to the earliest message we want to keep. When we exceed `maxTurns`, we break, and `startIndex` points to the first message of the oldest kept turn.

**Step 2: Verify**

```bash
npm run build --workspace=@page-chat/core
```

---

## Task 6: Dispatch attachment events from Core (Important)

**Problem:** Core's `addAttachment` and `removeAttachment` don't dispatch events. Panel's `#renderAttachments` is called explicitly in the file input handler, but `clear()` dispatches only `messagechange`, not attachment changes — leaving stale chips.

Also: `takeScreenshot()` result is stored in Core but Panel never gets notified or shows any indication.

**Fix:** Dispatch a new `attachmentchange` event from Core. Wire Panel to listen.

**Files:**

- Modify: `packages/core/src/PageChatCore.ts:227-250` — dispatch events on add/remove/clear
- Modify: `packages/page-chat/src/PageChat.ts` — forward attachmentchange
- Modify: `packages/ui/src/panel/Panel.ts` — listen for attachmentchange, remove manual `#renderAttachments` calls

**Step 1: Dispatch `attachmentchange` in Core**

In `packages/core/src/PageChatCore.ts`:

After line 236 (`this.attachments.push(attachment)`), add:

```typescript
this.dispatchEvent(new Event('attachmentchange'))
```

After line 241 (`this.attachments = this.attachments.filter(...)`), add:

```typescript
this.dispatchEvent(new Event('attachmentchange'))
```

In `clear()` (after line 246 `this.attachments = []`), add before the existing `messagechange` dispatch:

```typescript
this.dispatchEvent(new Event('attachmentchange'))
```

**Step 2: Forward in PageChat**

In `packages/page-chat/src/PageChat.ts`, add a new event forwarder:

```typescript
#onAttachmentChange = () => this.dispatchEvent(new Event('attachmentchange'))
```

Wire it in the constructor (after the existing event listeners):

```typescript
this.core.addEventListener('attachmentchange', this.#onAttachmentChange)
```

Unwire in dispose (before `this.core.dispose()`):

```typescript
this.core.removeEventListener('attachmentchange', this.#onAttachmentChange)
```

**Step 3: Listen in Panel**

In `packages/ui/src/panel/Panel.ts`, add event handler:

```typescript
#onAttachmentChange = () => this.#renderAttachments()
```

Wire in constructor (after line 67):

```typescript
this.#adapter.addEventListener('attachmentchange', this.#onAttachmentChange)
```

Unwire in dispose (line 107):

```typescript
this.#adapter.removeEventListener('attachmentchange', this.#onAttachmentChange)
```

Remove the manual `this.#renderAttachments()` call on line 178 (inside fileInput change handler) — it's now event-driven.

Also remove the `this.#renderAttachments()` call on line 207 (inside attachmentsBar click handler).

**Step 4: Verify**

```bash
npm run build --workspace=@page-chat/core && npm run build --workspace=@page-chat/ui && npm run build --workspace=page-chat
npx eslint packages/core/ packages/ui/ packages/page-chat/
```

---

## Task 7: Include full page context (header/footer/url/title) (Important)

**Problem:** `PageChatCore.refreshPage()` only stores `browserState.content`. BrowserState includes URL, title, viewport info, and scroll hints in `header` and `footer` that provide rich context for the LLM.

**Files:**

- Modify: `packages/core/src/PageChatCore.ts:210-219` — store full browser state
- Modify: `packages/core/src/PageChatCore.ts:74-76` — format with full context

**Step 1: Store full browser state**

Replace lines 210-219:

```typescript
async refreshPage(): Promise<void> {
	const browserState: BrowserState = await this.#pageController.getBrowserState()

	let content = [browserState.header, browserState.content, browserState.footer].join('\n')

	if (this.config.transformPageContent) {
		content = await this.config.transformPageContent(content)
	}

	this.pageContent = content
}
```

**Step 2: Verify**

```bash
npm run build --workspace=@page-chat/core
```

---

## Task 8: Add error handling to UI actions (Important)

**Problem:** `refreshPage()`, `takeScreenshot()`, and file upload have no try/catch in Panel event handlers. If they throw, the error silently swallows.

**Files:**

- Modify: `packages/ui/src/panel/Panel.ts:161,168,170-179` — wrap in try/catch

**Step 1: Wrap refresh, screenshot, and file upload handlers**

Replace lines 161, 168 in `#setupEventListeners()`:

```typescript
this.#refreshButton.addEventListener('click', async () => {
    try {
        await this.#adapter.refreshPage()
    } catch (error) {
        console.error('[PageChat] Failed to refresh page:', error)
    }
})
```

```typescript
this.#screenshotButton.addEventListener('click', async () => {
    try {
        await this.#adapter.takeScreenshot()
    } catch (error) {
        console.error('[PageChat] Failed to take screenshot:', error)
    }
})
```

For file upload (lines 170-179), wrap the for loop:

```typescript
this.#fileInput.addEventListener('change', async (e) => {
    const files = (e.target as HTMLInputElement).files
    if (files) {
        for (const file of Array.from(files)) {
            try {
                await this.#adapter.addAttachment(file)
            } catch (error) {
                console.error(`[PageChat] Failed to add attachment "${file.name}":`, error)
            }
        }
    }
    this.#fileInput.value = ''
})
```

Note: the manual `this.#renderAttachments()` call at line 178 should already be removed by Task 6 (event-driven). If Task 6 hasn't been applied yet, remove it here.

**Step 2: Verify**

```bash
npm run build --workspace=@page-chat/ui
npx eslint packages/ui/
```

---

## Task 9: Fix Core build entry (index.ts vs PageChatCore.ts) (Important)

**Problem:** `packages/core/vite.config.js` has `entry: 'src/PageChatCore.ts'` but `src/index.ts` is a barrel that re-exports from `PageChatCore.ts` + `fileUtils.ts`. The published package won't include the `fileUtils` exports.

**Files:**

- Modify: `packages/core/vite.config.js:23` — change entry to `src/index.ts`
- Modify: `packages/core/package.json:8,12,13` — update types path

**Step 1: Update build entry**

In `packages/core/vite.config.js`, replace line 23:

```javascript
entry: resolve(__dirname, 'src/index.ts'),
```

Also update `fileName` on line 25 — keep it as `page-chat-core`.

**Step 2: Update package.json types path**

In `packages/core/package.json`, update the types field:

```json
"types": "./dist/esm/index.d.ts",
```

And in exports:

```json
"exports": {
    ".": {
        "types": "./dist/esm/index.d.ts",
        "import": "./dist/esm/page-chat-core.js",
        "default": "./dist/esm/page-chat-core.js"
    }
},
```

**Step 3: Verify**

```bash
npm run build --workspace=@page-chat/core
ls packages/core/dist/esm/
```

Expected: `index.d.ts` exists in output, `page-chat-core.js` contains fileUtils exports.

---

## Task 10: Handle attachments-only send (Core vs Panel mismatch) (Important)

**Problem:** Panel allows sending with attachments-only (no text) — `#updateUIState` enables send when `this.#adapter.attachments.length > 0`. But `PageChatCore.sendMessage` early-returns on empty text (line 162: `if (!trimmedText) return`). The user presses send, nothing happens.

**Fix:** Core should allow empty text when attachments exist. Send a placeholder text like "[Attachments provided — please analyze]" to the LLM.

**Files:**

- Modify: `packages/core/src/PageChatCore.ts:160-162`

**Step 1: Allow attachments-only send**

Replace lines 160-162:

```typescript
async *sendMessage(text: string, signal?: AbortSignal): AsyncGenerator<string, void, undefined> {
	const trimmedText = text.trim()
	if (!trimmedText && this.attachments.length === 0) return

	const userText = trimmedText || '[User provided attachments for analysis]'
```

Then update line 164-168 to use `userText`:

```typescript
const userMessage: ChatMessage = {
    id: uid(),
    role: 'user',
    content: userText,
    timestamp: Date.now(),
}
```

And update line 174 to use `userText`:

```typescript
const llmMessages = this.#assembleMessages(userText)
```

**Step 2: Verify**

```bash
npm run build --workspace=@page-chat/core
```

---

## Task 11: Thorough `page-agent` → `page-chat` rename (Minor but comprehensive)

**Problem:** 29 files still reference `page-agent`/`PageAgent`. This task handles ALL non-deferred renames.

**Files (in order):**

1. `package.json` (root) — lines 21,23,28,29,33,34
2. `packages/ui/package.json` — description, keywords, URL, homepage
3. `packages/llms/package.json` — description, keywords, URL, homepage
4. `packages/page-controller/package.json` — keywords, URL, homepage
5. `packages/core/package.json` — description, keywords, URL, homepage
6. `packages/page-chat/package.json` — keywords, URL, homepage
7. `packages/ui/vite.config.js:26` — `name: 'PageAgentUI'` → `'PageChatUI'`
8. `packages/llms/vite.config.js:22` — `name: 'PageAgentLLMs'` → `'PageChatLLMs'`
9. `packages/llms/src/index.ts:31` — `[PageAgent]` → `[PageChat]`
10. `packages/core/src/utils/index.ts:42-43` — `__PAGE_AGENT_IDS__` → `__PAGE_CHAT_IDS__`
11. `packages/page-controller/src/utils/index.ts:59` — `PageAgent::MovePointerTo` → `PageChat::MovePointerTo`
12. `packages/page-controller/src/dom/index.ts:156,158` — docstring examples (cosmetic)
13. `packages/page-chat/vite.iife.config.js:48` — commented `page-agent.js` reference
14. `scripts/sync-version.js:57,108-111` — `page-agent` → `page-chat` in function + CDN URLs

**Do NOT rename:**

- `data-page-agent-ignore` / `data-page-agent-not-interactive` data attributes (DOM API convention, per user constraint)
- `packages/extension/`, `packages/website/`, `packages/mcp/` (deferred)
- `docs/CHANGELOG.md` (historical record)
- `docs/plans/` (internal planning docs)
- `.sisyphus/` (internal)

**Step 1: Root package.json**

Replace the following in `package.json`:

- `"url": "https://github.com/alibaba/page-agent.git"` → `"url": "https://github.com/alibaba/page-chat.git"`
- `"homepage": "https://alibaba.github.io/page-agent/"` → `"homepage": "https://alibaba.github.io/page-chat/"`
- `"start": "npm run dev --workspace=@page-agent/website"` → `"start": "npm run dev --workspace=@page-chat/website"`
- `"dev:ext": "npm run dev -w @page-agent/ext"` → `"dev:ext": "npm run dev -w @page-chat/ext"`
- `"build:website": "npm run build:website --workspace=@page-agent/website"` → `"build:website": "npm run build:website --workspace=@page-chat/website"`
- `"build:ext": "npm run build:libs && npm run zip -w @page-agent/ext"` → `"build:ext": "npm run build:libs && npm run zip -w @page-chat/ext"`
- `"description": "AI-powered UI agent for web applications"` → `"description": "In-page AI chatbot for web applications"`

**Step 2: Library package.json files**

For each of `packages/ui/package.json`, `packages/llms/package.json`, `packages/page-controller/package.json`, `packages/core/package.json`, `packages/page-chat/package.json`:

- Replace `"url": "https://github.com/alibaba/page-agent.git"` → `"url": "https://github.com/alibaba/page-chat.git"`
- Replace `"homepage": "https://alibaba.github.io/page-agent/"` → `"homepage": "https://alibaba.github.io/page-chat/"`
- Replace `"page-agent"` in keywords arrays → `"page-chat"`
- Update descriptions: remove "agent" references, use "chat" language

**Step 3: Vite config library names**

- `packages/ui/vite.config.js` line 26: `name: 'PageAgentUI'` → `name: 'PageChatUI'`
- `packages/llms/vite.config.js` line 22: `name: 'PageAgentLLMs'` → `name: 'PageChatLLMs'`

**Step 4: Source code runtime strings**

- `packages/llms/src/index.ts` line 31: `'[PageAgent]'` → `'[PageChat]'`
- `packages/core/src/utils/index.ts` lines 42-43: `__PAGE_AGENT_IDS__` → `__PAGE_CHAT_IDS__`
- `packages/page-controller/src/utils/index.ts` line 59: `'PageAgent::MovePointerTo'` → `'PageChat::MovePointerTo'`

**Step 5: scripts/sync-version.js**

- Line 57: `name === 'page-agent' || name.startsWith('@page-agent/')` → `name === 'page-chat' || name.startsWith('@page-chat/')`
- Lines 108-111: Update CDN URLs from `page-agent` to `page-chat`

**Step 6: Docstring examples**

- `packages/page-controller/src/dom/index.ts` lines 156,158: cosmetic docstring — replace `page-agent.js` with `page-chat.js`
- `packages/page-chat/vite.iife.config.js` line 48: commented `page-agent.js` → `page-chat.js`

**Step 7: Documentation files**

- `README.md` — Full rewrite deferred to separate task; for now, update the title, description, import examples, npm badge URLs, and CDN URLs from `page-agent` to `page-chat`. Keep acknowledgments and license intact.
- `CONTRIBUTING.md` — update package names and example commands
- `SECURITY.md` — update policy links
- `AGENTS.md` — update package names in architecture docs
- `docs/README-zh.md` — update badges, CDN links, code samples
- `docs/terms-and-privacy.md` — update project references

**Step 8: Regenerate package-lock.json**

```bash
rm package-lock.json && npm install
```

**Step 9: Verify**

```bash
npm run build
npx eslint packages/core/ packages/llms/ packages/page-controller/ packages/ui/ packages/page-chat/
```

Expected: Full build passes, no lint errors in our packages.

---

## Task 12: Minor cleanups

**Files:**

- Modify: `packages/core/src/types.ts:27` — document or remove `'error'` from ChatStatus
- Modify: `packages/core/package.json` — update description and keywords to reflect chatbot not agent
- Modify: `packages/page-chat/package.json` — update keywords to reflect chatbot not agent

**Step 1: Remove unused `'error'` status**

In `packages/core/src/types.ts`, line 27:

```typescript
// OLD:
export type ChatStatus = 'idle' | 'streaming' | 'error'

// NEW:
export type ChatStatus = 'idle' | 'streaming'
```

**Step 2: Update core package.json description/keywords**

Already handled as part of Task 11, Step 2.

**Step 3: Verify**

```bash
npm run build --workspace=@page-chat/core
npx eslint packages/core/
```

---

## Execution Order

Tasks are mostly independent, but some have ordering constraints:

1. **Task 1** (XSS) — independent, do first since it's critical
2. **Task 2** (streaming fix) — independent, critical
3. **Task 3** (CSS scoping) — independent, critical
4. **Task 4** (stop/dispose) — independent
5. **Task 5** (history fix) — independent
6. **Task 6** (attachment events) — must be before Task 8 (error handling removes manual calls)
7. **Task 7** (page context) — independent
8. **Task 8** (error handling) — after Task 6
9. **Task 9** (build entry) — independent
10. **Task 10** (attachments-only send) — independent
11. **Task 11** (rename) — do last, as it touches many files
12. **Task 12** (minor cleanup) — do with or after Task 11

## Final Verification

After all tasks:

```bash
npm run build
npx eslint .
```

Expected: All packages build, lint passes on our packages (extension has pre-existing errors — ignored).
