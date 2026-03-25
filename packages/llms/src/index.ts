import { OpenAIClient } from './OpenAIClient'
import { DEFAULT_TEMPERATURE, LLM_MAX_RETRIES } from './constants'
import { InvokeError, InvokeErrorType } from './errors'
import type {
	ChatOptions,
	InvokeOptions,
	InvokeResult,
	LLMClient,
	LLMConfig,
	Message,
	StreamOptions,
	Tool,
} from './types'

export { InvokeError, InvokeErrorType }
export type {
	ChatOptions,
	InvokeOptions,
	InvokeResult,
	LLMClient,
	LLMConfig,
	Message,
	StreamOptions,
	Tool,
}

export function parseLLMConfig(config: LLMConfig): Required<LLMConfig> {
	// Runtime validation as defensive programming (types already guarantee these)
	if (!config.baseURL || !config.model) {
		throw new Error(
			'[PageChat] LLM configuration required. Please provide: baseURL, model. ' +
				'See: https://alibaba.github.io/page-chat/docs/features/models'
		)
	}

	return {
		baseURL: config.baseURL,
		model: config.model,
		apiKey: config.apiKey || '',
		temperature: config.temperature ?? DEFAULT_TEMPERATURE,
		maxRetries: config.maxRetries ?? LLM_MAX_RETRIES,
		disableNamedToolChoice: config.disableNamedToolChoice ?? false,
		customFetch: (config.customFetch ?? fetch).bind(globalThis), // fetch will be illegal unless bound
	}
}

export class LLM extends EventTarget {
	config: Required<LLMConfig>
	client: LLMClient

	constructor(config: LLMConfig) {
		super()
		this.config = parseLLMConfig(config)

		// Default to OpenAI client
		this.client = new OpenAIClient(this.config)
	}

	/**
	 * - call llm api *once*
	 * - invoke tool call *once*
	 * - return the result of the tool
	 */
	async invoke(
		messages: Message[],
		tools: Record<string, Tool>,
		abortSignal: AbortSignal,
		options?: InvokeOptions
	): Promise<InvokeResult> {
		return await withRetry(
			async () => {
				// in case user aborted before invoking
				if (abortSignal.aborted) throw new Error('AbortError')

				const result = await this.client.invoke(messages, tools, abortSignal, options)

				return result
			},
			// retry settings
			{
				maxRetries: this.config.maxRetries,
				onRetry: (attempt: number) => {
					this.dispatchEvent(
						new CustomEvent('retry', { detail: { attempt, maxAttempts: this.config.maxRetries } })
					)
				},
				onError: (error: Error) => {
					this.dispatchEvent(new CustomEvent('error', { detail: { error } }))
				},
			}
		)
	}

	async chat(
		messages: Message[],
		abortSignal: AbortSignal,
		options?: ChatOptions
	): Promise<string> {
		if (!this.client.chat) {
			throw new Error('Current LLM client does not support chat()')
		}

		return await withRetry(
			async () => {
				if (abortSignal.aborted) throw new Error('AbortError')
				return await this.client.chat!(messages, abortSignal, options)
			},
			{
				maxRetries: this.config.maxRetries,
				onRetry: (attempt: number) => {
					this.dispatchEvent(
						new CustomEvent('retry', { detail: { attempt, maxAttempts: this.config.maxRetries } })
					)
				},
				onError: (error: Error) => {
					this.dispatchEvent(new CustomEvent('error', { detail: { error } }))
				},
			}
		)
	}

	async *stream(
		messages: Message[],
		options?: StreamOptions
	): AsyncGenerator<string, void, undefined> {
		if (!this.client.stream) {
			throw new Error('Current LLM client does not support stream()')
		}

		let attempt = 0
		while (attempt <= this.config.maxRetries) {
			if (attempt > 0) {
				this.dispatchEvent(
					new CustomEvent('retry', { detail: { attempt, maxAttempts: this.config.maxRetries } })
				)
				await new Promise((resolve) => setTimeout(resolve, 100))
			}

			const iterator = this.client.stream(messages, options)[Symbol.asyncIterator]()
			let hasYielded = false
			try {
				const first = await iterator.next()
				if (first.done) return
				hasYielded = true
				yield first.value

				while (true) {
					const nextChunk = await iterator.next()
					if (nextChunk.done) return
					hasYielded = true
					yield nextChunk.value
				}
			} catch (error: unknown) {
				if (hasYielded) {
					throw error
				}

				if (
					(error as any)?.rawError?.name === 'AbortError' ||
					(options?.signal?.aborted ?? false)
				) {
					throw error
				}

				this.dispatchEvent(new CustomEvent('error', { detail: { error } }))
				if (error instanceof InvokeError && !error.retryable) {
					throw error
				}

				if (attempt >= this.config.maxRetries) {
					throw error
				}
				attempt++
				continue
			}
		}

		throw new Error('stream() failed after retries')
	}
}

async function withRetry<T>(
	fn: () => Promise<T>,
	settings: {
		maxRetries: number
		onRetry: (attempt: number) => void
		onError: (error: Error) => void
	}
): Promise<T> {
	let attempt = 0
	let lastError: Error | null = null
	while (attempt <= settings.maxRetries) {
		if (attempt > 0) {
			settings.onRetry(attempt)
			await new Promise((resolve) => setTimeout(resolve, 100))
		}

		try {
			return await fn()
		} catch (error: unknown) {
			// do not retry if aborted by user
			if ((error as any)?.rawError?.name === 'AbortError') throw error

			console.error(error)
			settings.onError(error as Error)

			// do not retry if error is not retryable (InvokeError)
			if (error instanceof InvokeError && !error.retryable) throw error

			lastError = error as Error
			attempt++

			await new Promise((resolve) => setTimeout(resolve, 100))
		}
	}

	throw lastError!
}
