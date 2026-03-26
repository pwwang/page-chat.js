import DOMPurify from 'dompurify'
import { marked } from 'marked'

import pkg from '../../package.json'
import { I18n } from '../i18n'
import {
	createAssistantBubble,
	createAttachmentChip,
	createStreamingBubble,
	createUserBubble,
} from './cards'
import type { PanelChatAdapter } from './types'

import styles from './Panel.module.css'
import './panel-global.css'

const ICON_REFRESH = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`
const ICON_MINIMIZE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`
const ICON_RESTORE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`
const ICON_CLOSE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`
const ICON_CLEAR = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`
const ICON_ATTACH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`
const ICON_SCREENSHOT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`
const ICON_SEND = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`
const ICON_STOP = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>`
const ICON_TITLE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`

export interface PanelConfig {
	language?: 'en-US' | 'zh-CN'
	title?: string
}

export class Panel {
	#wrapper: HTMLElement
	#chatArea: HTMLElement
	#attachmentsBar: HTMLElement
	#inputArea: HTMLElement
	#textarea: HTMLTextAreaElement
	#fileInput: HTMLInputElement
	#sendButton: HTMLButtonElement
	#stopButton: HTMLButtonElement
	#attachButton: HTMLButtonElement
	#screenshotButton: HTMLButtonElement
	#refreshButton: HTMLButtonElement
	#clearButton: HTMLButtonElement
	#minimizeButton: HTMLButtonElement
	#closeButton: HTMLButtonElement

	#adapter: PanelChatAdapter
	#i18n: I18n
	#isExpanded = true
	#isStreaming = false
	#abortController: AbortController | null = null

	// Event handlers bound to instance
	#onStatusChange = () => this.#handleStatusChange()
	#onMessageChange = () => {
		// During streaming, #handleSend manages the streaming bubble directly.
		// Full re-render would wipe the streaming bubble. Wait for finally{} block.
		if (this.#abortController) return
		this.#renderMessages()
	}
	#onAttachmentChange = () => this.#renderAttachments()
	#onScreenshotChange = () => this.#updateScreenshotButton()

	get wrapper(): HTMLElement {
		return this.#wrapper
	}

	constructor(adapter: PanelChatAdapter, config: PanelConfig = {}) {
		this.#adapter = adapter
		this.#i18n = new I18n(config.language ?? 'en-US')

		this.#wrapper = this.#createWrapper(config.title)

		this.#chatArea = this.#wrapper.querySelector(`.${styles.chatArea}`)!
		this.#attachmentsBar = this.#wrapper.querySelector(`.${styles.attachmentsBar}`)!
		this.#inputArea = this.#wrapper.querySelector(`.${styles.inputArea}`)!
		this.#textarea = this.#wrapper.querySelector('textarea')!
		this.#fileInput = this.#wrapper.querySelector('input[type="file"]')!
		this.#sendButton = this.#wrapper.querySelector(`.${styles.sendBtn}`)!
		this.#stopButton = this.#wrapper.querySelector(`.${styles.stopBtn}`)!
		this.#attachButton = this.#wrapper.querySelector('.attach-btn')!
		this.#screenshotButton = this.#wrapper.querySelector('.screenshot-btn')!
		this.#refreshButton = this.#wrapper.querySelector('.refresh-btn')!
		this.#clearButton = this.#wrapper.querySelector('.clear-btn')!
		this.#minimizeButton = this.#wrapper.querySelector('.minimize-btn')!
		this.#closeButton = this.#wrapper.querySelector('.close-btn')!

		this.#adapter.addEventListener('statuschange', this.#onStatusChange)
		this.#adapter.addEventListener('messagechange', this.#onMessageChange)
		this.#adapter.addEventListener('attachmentchange', this.#onAttachmentChange)
		this.#adapter.addEventListener('screenshotchange', this.#onScreenshotChange)

		this.#setupEventListeners()
		this.#renderMessages()
		this.#updateUIState()
	}

	show(): void {
		this.#wrapper.style.display = 'block'
		requestAnimationFrame(() => {
			this.#wrapper.style.opacity = '1'
			this.#wrapper.style.transform = 'translateX(-50%) translateY(0)'
		})
	}

	hide(): void {
		this.#wrapper.style.opacity = '0'
		this.#wrapper.style.transform = 'translateX(-50%) translateY(20px)'
		setTimeout(() => {
			this.#wrapper.style.display = 'none'
		}, 300)
	}

	expand(): void {
		this.#isExpanded = true
		this.#chatArea.style.display = 'flex'
		this.#attachmentsBar.style.display = 'flex'
		this.#inputArea.style.display = 'flex'
		this.#minimizeButton.innerHTML = ICON_MINIMIZE
	}

	collapse(): void {
		this.#isExpanded = false
		this.#chatArea.style.display = 'none'
		this.#attachmentsBar.style.display = 'none'
		this.#inputArea.style.display = 'none'
		this.#minimizeButton.innerHTML = ICON_RESTORE
	}

	dispose(): void {
		this.#adapter.removeEventListener('statuschange', this.#onStatusChange)
		this.#adapter.removeEventListener('messagechange', this.#onMessageChange)
		this.#adapter.removeEventListener('attachmentchange', this.#onAttachmentChange)
		this.#adapter.removeEventListener('screenshotchange', this.#onScreenshotChange)
		this.#wrapper.remove()
	}

	reset(): void {
		this.#adapter.clear()
		this.#textarea.value = ''
		this.#adjustTextareaHeight()
	}

	#createWrapper(title?: string): HTMLElement {
		const wrapper = document.createElement('div')
		wrapper.id = 'page-chat-panel'
		wrapper.className = styles.wrapper
		wrapper.setAttribute('data-page-agent-ignore', 'true')

		wrapper.innerHTML = `
			<div class="${styles.background}"></div>
			<div class="${styles.container}">
				<header class="${styles.header}">
					<div class="${styles.title}" title="Powered by page-chat.js v${pkg.version}">${ICON_TITLE} ${title ?? this.#i18n.t('panel.title')}</div>
					<div class="${styles.controls}">
						<button class="refresh-btn" title="${this.#i18n.t('panel.refreshPage')}">${ICON_REFRESH}</button>
						<button class="clear-btn" title="${this.#i18n.t('panel.clearChat')}">${ICON_CLEAR}</button>
						<button class="minimize-btn" title="${this.#i18n.t('panel.minimize')}">${ICON_MINIMIZE}</button>
						<button class="close-btn" title="${this.#i18n.t('panel.close')}">${ICON_CLOSE}</button>
					</div>
				</header>

				<div class="${styles.chatArea}"></div>

				<div class="${styles.attachmentsBar}" style="display: none;"></div>

				<div class="${styles.inputArea}">
					<button class="${styles.actionBtn} attach-btn" title="${this.#i18n.t('panel.attach')}">${ICON_ATTACH}</button>
					<button class="${styles.actionBtn} screenshot-btn" title="${this.#i18n.t('panel.screenshot')}">${ICON_SCREENSHOT}</button>

					<div class="${styles.textareaContainer}">
						<textarea class="${styles.textarea}" rows="1" placeholder="${this.#i18n.t('panel.placeholder')}"></textarea>
					</div>

					<button class="${styles.actionBtn} ${styles.sendBtn}" title="${this.#i18n.t('panel.send')}">${ICON_SEND}</button>
					<button class="${styles.actionBtn} ${styles.stopBtn}" title="${this.#i18n.t('panel.stop')}" style="display: none;">${ICON_STOP}</button>
				</div>

				<input type="file" class="${styles.hiddenInput}" multiple accept=".txt,.md,.csv,.json,.js,.ts,.pdf,.png,.jpg,.gif,.webp">
			</div>
		`

		document.body.appendChild(wrapper)
		return wrapper
	}

	#setupEventListeners(): void {
		this.#refreshButton.addEventListener('click', async () => {
			try {
				await this.#adapter.refreshPage()
			} catch (error) {
				console.error('Refresh failed', error)
			}
		})
		this.#clearButton.addEventListener('click', () => this.reset())
		this.#minimizeButton.addEventListener('click', () =>
			this.#isExpanded ? this.collapse() : this.expand()
		)
		this.#closeButton.addEventListener('click', () => this.#adapter.dispose())

		this.#attachButton.addEventListener('click', () => this.#fileInput.click())
		this.#screenshotButton.addEventListener('click', async () => {
			try {
				await this.#adapter.takeScreenshot()
			} catch (error) {
				console.error('Screenshot failed', error)
			}
		})

		this.#fileInput.addEventListener('change', async (e) => {
			const files = (e.target as HTMLInputElement).files
			if (files) {
				for (const file of Array.from(files)) {
					try {
						await this.#adapter.addAttachment(file)
					} catch (error) {
						console.error(`Failed to attach ${file.name}`, error)
					}
				}
			}
			this.#fileInput.value = ''
		})

		this.#sendButton.addEventListener('click', () => this.#handleSend())
		this.#stopButton.addEventListener('click', () => {
			this.#abortController?.abort()
			this.#adapter.stop()
		})

		this.#textarea.addEventListener('input', () => {
			this.#adjustTextareaHeight()
			this.#updateUIState()
		})

		this.#textarea.addEventListener('keydown', (e) => {
			if (e.isComposing) return // Ignore IME composition keys
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault()
				this.#handleSend()
			}
		})

		this.#attachmentsBar.addEventListener('click', (e) => {
			const target = e.target as HTMLElement
			if (target.classList.contains('remove')) {
				const chip = target.closest('.chip')!
				const id = (chip as HTMLElement).dataset.id!
				if (id) {
					this.#adapter.removeAttachment(id)
				}
			}
		})
	}

	#handleStatusChange(): void {
		this.#isStreaming = this.#adapter.status === 'streaming'
		this.#updateUIState()

		if (this.#adapter.status === 'streaming') {
			this.#scrollToBottom()
		}
	}

	#updateUIState(): void {
		const hasText = this.#textarea.value.trim().length > 0
		const canSend = hasText || this.#adapter.attachments.length > 0

		if (this.#isStreaming) {
			this.#sendButton.style.display = 'none'
			this.#stopButton.style.display = 'flex'
			this.#textarea.disabled = true
		} else {
			this.#sendButton.style.display = 'flex'
			this.#stopButton.style.display = 'none'
			this.#sendButton.disabled = !canSend
			this.#textarea.disabled = false
			this.#textarea.focus()
		}
	}

	async #handleSend(): Promise<void> {
		const text = this.#textarea.value.trim()
		if (!text && this.#adapter.attachments.length === 0) return

		this.#textarea.value = ''
		this.#adjustTextareaHeight()

		const controller = new AbortController()
		const stream = this.#adapter.sendMessage(text, controller.signal)
		this.#abortController = controller

		// Show user message immediately (optimistic render).
		// The async generator hasn't started yet, so adapter.messages
		// doesn't contain it. Render directly from the input text.
		const userBubbleHTML = createUserBubble({
			id: '',
			role: 'user',
			content: text || '[attachments]',
			timestamp: Date.now(),
		})
		this.#chatArea.insertAdjacentHTML('beforeend', userBubbleHTML)

		const streamingBubbleHTML = createStreamingBubble()
		const tempDiv = document.createElement('div')
		tempDiv.innerHTML = streamingBubbleHTML
		const streamingBubble = tempDiv.firstElementChild as HTMLElement
		this.#chatArea.appendChild(streamingBubble)
		this.#scrollToBottom()

		const contentArea = streamingBubble.querySelector('.markdown-body')!
		let accumulatedResponse = ''

		try {
			for await (const chunk of stream) {
				accumulatedResponse += chunk
				contentArea.innerHTML = DOMPurify.sanitize(marked.parse(accumulatedResponse) as string)
				this.#scrollToBottom()
			}
		} catch (error) {
			console.error('Streaming failed', error)
			contentArea.textContent += `\n[${this.#i18n.t('errors.streamingFailed')}]`
		} finally {
			this.#abortController = null
			streamingBubble.remove()
			this.#renderMessages()
		}
	}

	#renderMessages(): void {
		const messages = this.#adapter.messages
		if (messages.length === 0) {
			this.#chatArea.innerHTML = ''
			return
		}

		this.#chatArea.innerHTML = messages
			.map((msg) => (msg.role === 'user' ? createUserBubble(msg) : createAssistantBubble(msg)))
			.join('')

		this.#scrollToBottom()
	}

	#renderAttachments(): void {
		const attachments = this.#adapter.attachments
		if (attachments.length === 0) {
			this.#attachmentsBar.style.display = 'none'
			this.#attachmentsBar.innerHTML = ''
		} else {
			this.#attachmentsBar.style.display = 'flex'
			this.#attachmentsBar.innerHTML = attachments.map((att) => createAttachmentChip(att)).join('')
		}
		this.#updateUIState()
	}

	#updateScreenshotButton(): void {
		const active = this.#adapter.pageScreenshot !== null
		this.#screenshotButton.classList.toggle(styles.screenshotActive, active)
		this.#screenshotButton.title = active
			? this.#i18n.t('panel.screenshotActive')
			: this.#i18n.t('panel.screenshot')
	}

	#scrollToBottom(): void {
		requestAnimationFrame(() => {
			this.#chatArea.scrollTop = this.#chatArea.scrollHeight
		})
	}

	#adjustTextareaHeight(): void {
		this.#textarea.style.height = 'auto'
		this.#textarea.style.height = Math.min(this.#textarea.scrollHeight, 120) + 'px'
	}
}
