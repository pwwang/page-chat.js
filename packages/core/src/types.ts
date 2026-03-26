import type { LLMConfig } from '@page-chat/llms'

export type SupportedLanguage = 'en-US' | 'zh-CN'

export interface PageChatConfig extends LLMConfig {
	language?: SupportedLanguage
	title?: string
	enableScreenshot?: boolean
	systemPrompt?: string
	maxConversationTurns?: number
	transformPageContent?: (content: string) => Promise<string> | string
	persist?: boolean
}

export interface ChatMessage {
	id: string
	role: 'user' | 'assistant'
	content: string
	timestamp: number
	error?: boolean
}

export interface Attachment {
	id: string
	name: string
	type: 'text' | 'pdf' | 'image'
	content: string
}

export type ChatStatus = 'idle' | 'streaming'
