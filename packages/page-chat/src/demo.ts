/**
 * IIFE demo entry - auto-initializes with built-in demo API for testing
 */
import { PageChat, type PageChatConfig } from './PageChat'

// Clean up existing instances to prevent multiple injections from bookmarklet
if (window.pageChat) {
	window.pageChat.dispose()
}

// Mount to global window object
window.PageChat = PageChat

console.log('🚀 page-chat.js loaded!')

const DEMO_MODEL = 'bjoernb/claude-haiku-4-5'
const DEMO_BASE_URL = 'http://localhost:11434/v1'
const DEMO_API_KEY = 'NA'

// in case document.x is not ready yet
setTimeout(() => {
	const currentScript = document.currentScript as HTMLScriptElement | null
	let config: PageChatConfig

	if (currentScript) {
		console.log('🚀 page-chat.js detected current script:', currentScript.src)
		const url = new URL(currentScript.src)
		const model = url.searchParams.get('model') || DEMO_MODEL
		const baseURL = url.searchParams.get('baseURL') || DEMO_BASE_URL
		const apiKey = url.searchParams.get('apiKey') || DEMO_API_KEY
		const language = (url.searchParams.get('lang') as 'zh-CN' | 'en-US') || 'zh-CN'
		config = { model, baseURL, apiKey, language }
	} else {
		console.log('🚀 page-chat.js no current script detected, using default demo config')
		config = {
			model: import.meta.env.LLM_MODEL_NAME ? import.meta.env.LLM_MODEL_NAME : DEMO_MODEL,
			baseURL: import.meta.env.LLM_BASE_URL ? import.meta.env.LLM_BASE_URL : DEMO_BASE_URL,
			apiKey: import.meta.env.LLM_API_KEY ? import.meta.env.LLM_API_KEY : DEMO_API_KEY,
			persist: true,
		}
	}

	window.pageChat = new PageChat(config)
	window.pageChat.panel.show()
	window.pageChat.refreshPage().catch((error) => {
		console.error('Failed to preload page content:', error)
	})

	console.log('🚀 page-chat.js initialized with config:', window.pageChat.config)
})
