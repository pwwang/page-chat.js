/**
 * Copyright (C) 2025 Alibaba Group Holding Limited
 * Copyright (C) 2026 SimonLuvRamen
 * All rights reserved.
 */
import {
	type Attachment,
	type ChatMessage,
	type ChatStatus,
	type PageChatConfig,
	PageChatCore,
} from '@page-chat/core'
import { PageController } from '@page-chat/page-controller'
import { Panel, type PanelChatAdapter } from '@page-chat/ui'

export * from '@page-chat/core'

export class PageChat extends EventTarget implements PanelChatAdapter {
	readonly panel: Panel
	readonly core: PageChatCore

	readonly config: PageChatCore['config']

	#onMessageChange = () => this.dispatchEvent(new Event('messagechange'))
	#onStatusChange = () => this.dispatchEvent(new Event('statuschange'))
	#onAttachmentChange = () => this.dispatchEvent(new Event('attachmentchange'))
	#onScreenshotChange = () => this.dispatchEvent(new Event('screenshotchange'))
	#currentAbortController: AbortController | null = null

	constructor(config: PageChatConfig) {
		super()

		const pageController = new PageController()

		this.core = new PageChatCore({ ...config, pageController })
		this.config = this.core.config

		this.core.addEventListener('messagechange', this.#onMessageChange)
		this.core.addEventListener('statuschange', this.#onStatusChange)
		this.core.addEventListener('attachmentchange', this.#onAttachmentChange)
		this.core.addEventListener('screenshotchange', this.#onScreenshotChange)

		this.panel = new Panel(this, {
			language: config.language,
			title: config.title,
		})

		this.refreshPage().catch((error) => {
			console.warn('[page-chat] Initial page scan failed:', error)
		})
	}

	get messages(): ChatMessage[] {
		return this.core.messages
	}

	get attachments(): Attachment[] {
		return this.core.attachments
	}

	get pageScreenshot(): string | null {
		return this.core.pageScreenshot
	}

	get status(): ChatStatus {
		return this.core.status
	}

	sendMessage(text: string, signal?: AbortSignal): AsyncGenerator<string, void, unknown> {
		const controller = new AbortController()
		this.#currentAbortController = controller

		// If external signal aborts, propagate to our controller
		if (signal) {
			signal.addEventListener('abort', () => controller.abort(), { once: true })
		}

		return this.core.sendMessage(text, controller.signal)
	}

	async refreshPage(): Promise<void> {
		await this.core.refreshPage()
	}

	async takeScreenshot(): Promise<string | null> {
		return this.core.takeScreenshot()
	}

	async addAttachment(file: File): Promise<Attachment> {
		return this.core.addAttachment(file)
	}

	async addFile(file: File): Promise<Attachment> {
		return this.addAttachment(file)
	}

	removeAttachment(id: string): void {
		this.core.removeAttachment(id)
	}

	stop(): void {
		this.#currentAbortController?.abort()
		this.#currentAbortController = null
	}

	clear(): void {
		this.core.clear()
	}

	dispose(): void {
		this.stop()
		this.panel.dispose()
		this.core.removeEventListener('messagechange', this.#onMessageChange)
		this.core.removeEventListener('statuschange', this.#onStatusChange)
		this.core.removeEventListener('attachmentchange', this.#onAttachmentChange)
		this.core.removeEventListener('screenshotchange', this.#onScreenshotChange)
		this.core.dispose()
	}
}

export type { PageChatConfig }
