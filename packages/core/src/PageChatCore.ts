/**
 * Copyright (C) 2025 Alibaba Group Holding Limited
 * Copyright (C) 2026 SimonLuvRamen
 * All rights reserved.
 */
import { LLM, type Message } from '@page-chat/llms'
import type { BrowserState, PageController } from '@page-chat/page-controller'

import CHAT_SYSTEM_PROMPT from './prompts/chat_system_prompt.md?raw'
import type { Attachment, ChatMessage, ChatStatus, PageChatConfig } from './types'
import { uid } from './utils'
import { captureScreenshot, parseFile } from './utils/fileUtils'

export type PageChatCoreConfig = PageChatConfig & { pageController: PageController }

export type * from './types'

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
	if (signal?.aborted) return true

	if (error instanceof DOMException && error.name === 'AbortError') return true
	if (error instanceof Error && error.name === 'AbortError') return true

	if (typeof error === 'object' && error !== null && 'rawError' in error) {
		const rawError = (error as { rawError?: unknown }).rawError
		if (rawError instanceof DOMException && rawError.name === 'AbortError') return true
		if (rawError instanceof Error && rawError.name === 'AbortError') return true
	}

	return false
}

export class PageChatCore extends EventTarget {
	readonly config: PageChatCoreConfig
	readonly pageController: PageController

	messages: ChatMessage[] = []
	pageContent: string | null = null
	pageScreenshot: string | null = null
	attachments: Attachment[] = []

	#status: ChatStatus = 'idle'
	#llm: LLM
	#pageController: PageController

	constructor(config: PageChatCoreConfig) {
		super()
		this.config = config
		this.#llm = new LLM(config)
		this.pageController = config.pageController
		this.#pageController = config.pageController
	}

	get status(): ChatStatus {
		return this.#status
	}

	#setStatus(status: ChatStatus): void {
		if (this.#status === status) return
		this.#status = status
		this.dispatchEvent(new Event('statuschange'))
	}

	#resolveSystemPrompt(): string {
		if (this.config.systemPrompt) return this.config.systemPrompt

		const targetLanguage = this.config.language === 'zh-CN' ? '中文' : 'English'
		return CHAT_SYSTEM_PROMPT.replace(
			/Default working language: \*\*.*?\*\*/,
			`Default working language: **${targetLanguage}**`
		)
	}

	#formatPageContext(content: string): string {
		return ['<page_context>', content, '</page_context>'].join('\n')
	}

	#formatTextAttachment(attachment: Attachment): string {
		return [
			'<attachment>',
			`name: ${attachment.name}`,
			`type: ${attachment.type}`,
			attachment.content,
			'</attachment>',
		].join('\n')
	}

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

	#assembleMessages(userText: string): Message[] {
		const messages: Message[] = [{ role: 'system', content: this.#resolveSystemPrompt() }]

		if (this.pageContent) {
			messages.push({ role: 'user', content: this.#formatPageContext(this.pageContent) })
		}

		if (this.config.enableScreenshot && this.pageScreenshot) {
			messages.push({
				role: 'user',
				content: [
					{ type: 'text', text: 'Current page screenshot:' },
					{ type: 'image_url', image_url: { url: this.pageScreenshot } },
				],
			})
		}

		for (const attachment of this.attachments) {
			if (attachment.type === 'image') {
				messages.push({
					role: 'user',
					content: [
						{ type: 'text', text: `Attachment image: ${attachment.name}` },
						{ type: 'image_url', image_url: { url: attachment.content } },
					],
				})
				continue
			}

			messages.push({
				role: 'user',
				content: this.#formatTextAttachment(attachment),
			})
		}

		let history = this.messages
		const lastMessage = this.messages[this.messages.length - 1]
		if (lastMessage?.role === 'user' && lastMessage.content === userText) {
			history = this.messages.slice(0, -1)
		}

		history = this.#limitHistoryByTurns(history)

		for (const historyMessage of history) {
			messages.push({ role: historyMessage.role, content: historyMessage.content })
		}

		messages.push({ role: 'user', content: userText })

		return messages
	}

	async *sendMessage(text: string, signal?: AbortSignal): AsyncGenerator<string, void, undefined> {
		const trimmedText = text.trim()
		if (!trimmedText && this.attachments.length === 0) return

		const userText = trimmedText || '[User provided attachments for analysis]'

		const userMessage: ChatMessage = {
			id: uid(),
			role: 'user',
			content: userText,
			timestamp: Date.now(),
		}

		this.messages.push(userMessage)
		this.dispatchEvent(new Event('messagechange'))

		const llmMessages = this.#assembleMessages(userText)
		this.#setStatus('streaming')

		let assistantText = ''
		let shouldPersistAssistantMessage = false

		try {
			for await (const chunk of this.#llm.stream(llmMessages, { signal })) {
				assistantText += chunk
				yield chunk
			}
			shouldPersistAssistantMessage = true
		} catch (error: unknown) {
			if (isAbortError(error, signal)) {
				shouldPersistAssistantMessage = true
			} else {
				if (assistantText.length > 0) {
					shouldPersistAssistantMessage = true
				}
				throw error
			}
		} finally {
			if (shouldPersistAssistantMessage) {
				this.messages.push({
					id: uid(),
					role: 'assistant',
					content: assistantText,
					timestamp: Date.now(),
				})
				this.dispatchEvent(new Event('messagechange'))
			}

			this.#setStatus('idle')
		}
	}

	async refreshPage(): Promise<void> {
		const browserState: BrowserState = await this.#pageController.getBrowserState()

		let content = [browserState.header, browserState.content, browserState.footer].join('\n')

		if (this.config.transformPageContent) {
			content = await this.config.transformPageContent(content)
		}

		this.pageContent = content
	}

	async takeScreenshot(): Promise<string | null> {
		if (this.config.enableScreenshot === false) return null
		this.pageScreenshot = await captureScreenshot()
		this.dispatchEvent(new Event('screenshotchange'))
		return this.pageScreenshot
	}

	async addAttachment(file: File): Promise<Attachment> {
		const parsedFile = await parseFile(file)
		const attachment: Attachment = {
			id: uid(),
			name: file.name,
			type: parsedFile.type,
			content: parsedFile.content,
		}

		this.attachments.push(attachment)
		this.dispatchEvent(new Event('attachmentchange'))
		return attachment
	}

	removeAttachment(id: string): void {
		this.attachments = this.attachments.filter((attachment) => attachment.id !== id)
		this.dispatchEvent(new Event('attachmentchange'))
	}

	clear(): void {
		this.messages = []
		this.attachments = []
		this.pageContent = null
		this.pageScreenshot = null
		this.dispatchEvent(new Event('attachmentchange'))
		this.dispatchEvent(new Event('screenshotchange'))
		this.dispatchEvent(new Event('messagechange'))
	}

	dispose(): void {
		this.clear()
		this.#setStatus('idle')
		this.#pageController.dispose()
	}
}
