import type { Attachment, ChatMessage, ChatStatus } from '@page-chat/core'

export interface PanelChatAdapter extends EventTarget {
	readonly messages: ChatMessage[]
	readonly attachments: Attachment[]
	readonly pageScreenshot: string | null
	readonly status: ChatStatus

	sendMessage(text: string, signal?: AbortSignal): AsyncGenerator<string, void, unknown>
	refreshPage(): Promise<void>
	takeScreenshot(): Promise<string | null>
	addAttachment(file: File): Promise<Attachment>
	removeAttachment(id: string): void
	stop(): void
	clear(): void
	dispose(): void
}
