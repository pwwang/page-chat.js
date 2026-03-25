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
	// marked.parse is synchronous by default
	const rawHtml = marked.parse(message.content) as string
	const content = DOMPurify.sanitize(rawHtml)
	const errorClass = (message as { error?: boolean }).error ? ' error' : ''
	return `
		<div class="message assistant${errorClass}">
			<div class="content markdown-body">${content}</div>
		</div>
	`
}

export function createStreamingBubble(): string {
	return `
		<div class="message assistant streaming">
			<div class="content markdown-body"></div>
			<div class="cursor"></div>
		</div>
	`
}

export function createAttachmentChip(attachment: Attachment): string {
	let icon = '📄'
	if (attachment.type === 'image') icon = '🖼️'
	if (attachment.type === 'pdf') icon = '📑'

	return `
		<div class="chip" data-id="${attachment.id}">
			<span class="icon">${icon}</span>
			<span class="name">${escapeHtml(attachment.name)}</span>
			<button class="remove" title="Remove">×</button>
		</div>
	`
}
