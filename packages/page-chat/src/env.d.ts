/// <reference types="vite/client" />
import type { PageChat } from './PageChat'

declare global {
	interface Window {
		pageChat?: PageChat
		PageChat: typeof PageChat
	}
}
