export { Panel, type PanelConfig } from './panel/Panel'
export { I18n, type SupportedLanguage, type TranslationKey } from './i18n'
export type { PanelChatAdapter } from './panel/types'

// Re-export common types from core for convenience
export type { ChatMessage, Attachment, ChatStatus } from '@page-chat/core'
