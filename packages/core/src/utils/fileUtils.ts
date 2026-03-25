export function parseTextFile(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`))
		reader.readAsText(file, 'utf-8')
	})
}

export function readImageFile(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = () => reject(new Error(`Failed to read image: ${file.name}`))
		reader.readAsDataURL(file)
	})
}

export async function parsePDF(file: File): Promise<string> {
	try {
		const pdfjsLib = await import('pdfjs-dist')
		pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
			'pdfjs-dist/build/pdf.worker.min.mjs',
			import.meta.url
		).toString()

		const arrayBuffer = await file.arrayBuffer()
		const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

		const pages: string[] = []
		for (let i = 1; i <= pdf.numPages; i++) {
			const page = await pdf.getPage(i)
			const textContent = await page.getTextContent()
			const pageText = textContent.items
				.map((item) => {
					if (typeof item === 'object' && item !== null && 'str' in item) {
						return (item as { str?: string }).str ?? ''
					}
					return ''
				})
				.join(' ')
			pages.push(pageText)
		}

		return pages.join('\n\n')
	} catch (error) {
		throw new Error(`Failed to parse PDF: ${file.name}`, { cause: error })
	}
}

export async function captureScreenshot(): Promise<string> {
	try {
		const html2canvas = (await import('html2canvas')).default
		const canvas = await html2canvas(document.body, {
			width: window.innerWidth,
			height: window.innerHeight,
			x: window.scrollX,
			y: window.scrollY,
			ignoreElements: (element: Element) => {
				return element.getAttribute('data-page-agent-ignore') === 'true'
			},
			useCORS: true,
			logging: false,
		})
		return canvas.toDataURL('image/png')
	} catch (error) {
		throw new Error('Failed to capture screenshot', { cause: error })
	}
}

const TEXT_EXTENSIONS = new Set([
	'txt',
	'md',
	'csv',
	'json',
	'js',
	'ts',
	'jsx',
	'tsx',
	'html',
	'css',
	'xml',
	'yaml',
	'yml',
	'toml',
	'ini',
	'sh',
	'bash',
	'py',
	'rb',
	'go',
	'rs',
	'java',
	'c',
	'cpp',
	'h',
	'sql',
	'log',
	'env',
	'gitignore',
	'conf',
	'cfg',
])

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'])

export function getFileType(file: File): 'text' | 'pdf' | 'image' | 'unknown' {
	if (file.type === 'application/pdf') return 'pdf'
	if (IMAGE_TYPES.has(file.type)) return 'image'

	const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
	if (TEXT_EXTENSIONS.has(ext)) return 'text'
	if (file.type.startsWith('text/')) return 'text'

	return 'unknown'
}

export async function parseFile(
	file: File
): Promise<{ type: 'text' | 'pdf' | 'image'; content: string }> {
	const fileType = getFileType(file)

	switch (fileType) {
		case 'text':
			return { type: 'text', content: await parseTextFile(file) }
		case 'pdf':
			return { type: 'pdf', content: await parsePDF(file) }
		case 'image':
			return { type: 'image', content: await readImageFile(file) }
		default:
			throw new Error(`Unsupported file type: ${file.name} (${file.type})`)
	}
}
