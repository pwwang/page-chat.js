// English translations (base/reference language)
export const enUS = {
	panel: {
		title: 'Page Chat',
		refreshPage: 'Rescan Page',
		minimize: 'Minimize',
		close: 'Close',
		send: 'Send',
		stop: 'Stop',
		attach: 'Attach File',
		screenshot: 'Take Screenshot',
		screenshotActive: 'Screenshot captured',
		placeholder: 'Type a message...',
		streaming: 'Thinking...',
		error: 'Error',
		clearChat: 'Clear Chat',
	},
	attachments: {
		fileUpload: 'Upload File',
		removeAttachment: 'Remove',
		pdf: 'PDF',
		image: 'Image',
		text: 'Text',
	},
	errors: {
		emptyMessage: 'Please enter a message',
		uploadFailed: 'Upload failed',
		streamingFailed: 'Streaming failed',
		refreshFailed: 'Failed to rescan page',
		screenshotFailed: 'Failed to take screenshot',
	},
} as const

// Chinese translations
export const zhCN = {
	panel: {
		title: '网页助手',
		refreshPage: '重新扫描页面',
		minimize: '最小化',
		close: '关闭',
		send: '发送',
		stop: '停止',
		attach: '添加附件',
		screenshot: '截屏',
		screenshotActive: '截图已捕获',
		placeholder: '输入消息...',
		streaming: '思考中...',
		error: '错误',
		clearChat: '清空对话',
	},
	attachments: {
		fileUpload: '上传文件',
		removeAttachment: '移除',
		pdf: 'PDF',
		image: '图片',
		text: '文本',
	},
	errors: {
		emptyMessage: '请输入消息',
		uploadFailed: '上传失败',
		streamingFailed: '流式响应失败',
		refreshFailed: '重新扫描页面失败',
		screenshotFailed: '截屏失败',
	},
} as const

// Type definitions
type DeepStringify<T> = {
	[K in keyof T]: T[K] extends string ? string : T[K] extends object ? DeepStringify<T[K]> : T[K]
}

export type TranslationSchema = DeepStringify<typeof enUS>

type NestedKeyOf<ObjectType extends object> = {
	[Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
		? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
		: `${Key}`
}[keyof ObjectType & (string | number)]

export type TranslationKey = NestedKeyOf<TranslationSchema>

export type TranslationParams = Record<string, string | number>

export const locales = {
	'en-US': enUS,
	'zh-CN': zhCN,
} as const

export type SupportedLanguage = keyof typeof locales
