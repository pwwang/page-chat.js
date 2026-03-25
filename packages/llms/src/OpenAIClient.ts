/**
 * OpenAI Client implementation
 */
import * as z from 'zod/v4'

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
import { modelPatch, zodToOpenAITool } from './utils'

/**
 * Client for OpenAI compatible APIs
 */
export class OpenAIClient implements LLMClient {
	config: Required<LLMConfig>
	private fetch: typeof globalThis.fetch

	constructor(config: Required<LLMConfig>) {
		this.config = config
		this.fetch = config.customFetch
	}

	private getChatCompletionURL(): string {
		return `${this.config.baseURL}/chat/completions`
	}

	private getRequestHeaders(): HeadersInit {
		return {
			'Content-Type': 'application/json',
			...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
		}
	}

	private async parseHTTPError(response: Response): Promise<never> {
		const errorData = await response.json().catch(() => undefined)
		const errorMessage =
			(errorData as { error?: { message?: string } } | undefined)?.error?.message ||
			response.statusText

		if (response.status === 401 || response.status === 403) {
			throw new InvokeError(
				InvokeErrorType.AUTH_ERROR,
				`Authentication failed: ${errorMessage}`,
				undefined,
				errorData
			)
		}
		if (response.status === 429) {
			throw new InvokeError(
				InvokeErrorType.RATE_LIMIT,
				`Rate limit exceeded: ${errorMessage}`,
				undefined,
				errorData
			)
		}
		if (response.status >= 500) {
			throw new InvokeError(
				InvokeErrorType.SERVER_ERROR,
				`Server error: ${errorMessage}`,
				undefined,
				errorData
			)
		}
		throw new InvokeError(
			InvokeErrorType.UNKNOWN,
			`HTTP ${response.status}: ${errorMessage}`,
			undefined,
			errorData
		)
	}

	private async postChatCompletions(
		requestBody: Record<string, unknown>,
		abortSignal?: AbortSignal
	): Promise<Response> {
		let response: Response
		try {
			response = await this.fetch(this.getChatCompletionURL(), {
				method: 'POST',
				headers: this.getRequestHeaders(),
				body: JSON.stringify(requestBody),
				signal: abortSignal,
			})
		} catch (error: unknown) {
			const isAbortError = (error as any)?.name === 'AbortError'
			const errorMessage = isAbortError ? 'Network request aborted' : 'Network request failed'
			if (!isAbortError) console.error(error)
			throw new InvokeError(InvokeErrorType.NETWORK_ERROR, errorMessage, error)
		}

		if (!response.ok) {
			await this.parseHTTPError(response)
		}

		return response
	}

	private assertFinishReason(choice: any, data: unknown): void {
		switch (choice.finish_reason) {
			case 'tool_calls':
			case 'function_call':
			case 'stop':
				break
			case 'length':
				throw new InvokeError(
					InvokeErrorType.CONTEXT_LENGTH,
					'Response truncated: max tokens reached',
					undefined,
					data
				)
			case 'content_filter':
				throw new InvokeError(
					InvokeErrorType.CONTENT_FILTER,
					'Content filtered by safety system',
					undefined,
					data
				)
			default:
				throw new InvokeError(
					InvokeErrorType.UNKNOWN,
					`Unexpected finish_reason: ${choice.finish_reason}`,
					undefined,
					data
				)
		}
	}

	private extractMessageText(content: unknown): string {
		if (typeof content === 'string') return content

		if (Array.isArray(content)) {
			const text = content
				.map((part) => {
					if (typeof part === 'string') return part
					if (part && typeof part === 'object') {
						const partText = (part as { text?: unknown }).text
						if (typeof partText === 'string') return partText
					}
					return ''
				})
				.join('')
			if (text.length > 0) return text
		}

		return ''
	}

	async invoke(
		messages: Message[],
		tools: Record<string, Tool>,
		abortSignal?: AbortSignal,
		options?: InvokeOptions
	): Promise<InvokeResult> {
		// 1. Convert tools to OpenAI format
		const openaiTools = Object.entries(tools).map(([name, t]) => zodToOpenAITool(name, t))

		// Build request body

		let toolChoice: unknown = 'required'
		if (options?.toolChoiceName && !this.config.disableNamedToolChoice) {
			toolChoice = { type: 'function', function: { name: options.toolChoiceName } }
		}

		const requestBody: Record<string, unknown> = {
			model: this.config.model,
			temperature: this.config.temperature,
			messages,
			tools: openaiTools,
			parallel_tool_calls: false,
			tool_choice: toolChoice,
		}

		modelPatch(requestBody)

		// 2. Call API
		const response = await this.postChatCompletions(requestBody, abortSignal)

		// 4. Parse and validate response
		const data = await response.json()

		const choice = data.choices?.[0]
		if (!choice) {
			throw new InvokeError(InvokeErrorType.UNKNOWN, 'No choices in response', data)
		}

		this.assertFinishReason(choice, data)

		// Apply normalizeResponse if provided (for fixing format issues automatically)
		const normalizedData = options?.normalizeResponse ? options.normalizeResponse(data) : data
		const normalizedChoice = (normalizedData as any).choices?.[0]

		// Get tool name from response
		const toolCallName = normalizedChoice?.message?.tool_calls?.[0]?.function?.name
		if (!toolCallName) {
			throw new InvokeError(
				InvokeErrorType.NO_TOOL_CALL,
				'No tool call found in response',
				undefined,
				data
			)
		}

		const tool = tools[toolCallName]
		if (!tool) {
			throw new InvokeError(
				InvokeErrorType.UNKNOWN,
				`Tool "${toolCallName}" not found in tools`,
				undefined,
				data
			)
		}

		// Extract and parse tool arguments
		const argString = normalizedChoice.message?.tool_calls?.[0]?.function?.arguments
		if (!argString) {
			throw new InvokeError(
				InvokeErrorType.INVALID_TOOL_ARGS,
				'No tool call arguments found',
				undefined,
				data
			)
		}

		let parsedArgs: unknown
		try {
			parsedArgs = JSON.parse(argString)
		} catch (error) {
			throw new InvokeError(
				InvokeErrorType.INVALID_TOOL_ARGS,
				'Failed to parse tool arguments as JSON',
				error,
				data
			)
		}

		// Validate with schema
		const validation = tool.inputSchema.safeParse(parsedArgs)
		if (!validation.success) {
			console.error(z.prettifyError(validation.error))
			throw new InvokeError(
				InvokeErrorType.INVALID_TOOL_ARGS,
				'Tool arguments validation failed',
				validation.error,
				data
			)
		}
		const toolInput = validation.data

		// 5. Execute tool
		let toolResult: unknown
		try {
			toolResult = await tool.execute(toolInput)
		} catch (e) {
			throw new InvokeError(
				InvokeErrorType.TOOL_EXECUTION_ERROR,
				`Tool execution failed: ${(e as Error).message}`,
				e,
				data
			)
		}

		// Return result
		return {
			toolCall: {
				name: toolCallName,
				args: toolInput,
			},
			toolResult,
			usage: {
				promptTokens: data.usage?.prompt_tokens ?? 0,
				completionTokens: data.usage?.completion_tokens ?? 0,
				totalTokens: data.usage?.total_tokens ?? 0,
				cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens,
				reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens,
			},
			rawResponse: data,
			rawRequest: requestBody,
		}
	}

	async chat(
		messages: Message[],
		abortSignal?: AbortSignal,
		options?: ChatOptions
	): Promise<string> {
		const requestBody: Record<string, unknown> = {
			model: this.config.model,
			temperature: this.config.temperature,
			messages,
		}

		modelPatch(requestBody)

		const response = await this.postChatCompletions(requestBody, abortSignal)
		const data = await response.json()

		const choice = data.choices?.[0]
		if (!choice) {
			throw new InvokeError(InvokeErrorType.UNKNOWN, 'No choices in response', undefined, data)
		}

		this.assertFinishReason(choice, data)

		const normalizedData = options?.normalizeResponse ? options.normalizeResponse(data) : data
		const normalizedChoice = (normalizedData as any).choices?.[0]
		const text = this.extractMessageText(normalizedChoice?.message?.content)

		if (!text) {
			throw new InvokeError(
				InvokeErrorType.UNKNOWN,
				'No assistant text found in response',
				undefined,
				data
			)
		}

		return text
	}

	async *stream(
		messages: Message[],
		options?: StreamOptions
	): AsyncGenerator<string, void, undefined> {
		const requestBody: Record<string, unknown> = {
			model: this.config.model,
			temperature: this.config.temperature,
			messages,
			stream: true,
		}

		modelPatch(requestBody)

		const response = await this.postChatCompletions(requestBody, options?.signal)
		if (!response.body) {
			throw new InvokeError(InvokeErrorType.NETWORK_ERROR, 'Streaming response body is empty')
		}

		const reader = response.body.getReader()
		const decoder = new TextDecoder()
		let buffered = ''
		let done = false

		const abortHandler = () => {
			void reader.cancel(options!.signal!.reason)
		}

		if (options?.signal) {
			if (options.signal.aborted) {
				void reader.cancel(options.signal.reason)
				throw new InvokeError(
					InvokeErrorType.NETWORK_ERROR,
					'Network request aborted',
					new DOMException('Aborted', 'AbortError')
				)
			}
			options.signal.addEventListener('abort', abortHandler)
		}

		try {
			while (!done) {
				if (options?.signal?.aborted) {
					throw new InvokeError(
						InvokeErrorType.NETWORK_ERROR,
						'Network request aborted',
						new DOMException('Aborted', 'AbortError')
					)
				}

				const readResult = await reader.read()
				done = readResult.done
				if (readResult.value) {
					buffered += decoder.decode(readResult.value, { stream: true })
				}

				const lines = buffered.split(/\r?\n/)
				buffered = lines.pop() ?? ''

				for (const rawLine of lines) {
					const line = rawLine.trim()
					if (!line || line.startsWith(':')) continue
					if (!line.startsWith('data:')) continue

					const payload = line.slice(5).trim()
					if (!payload) continue
					if (payload === '[DONE]') return

					let parsed: any
					try {
						parsed = JSON.parse(payload)
					} catch (error) {
						throw new InvokeError(
							InvokeErrorType.UNKNOWN,
							'Malformed streaming JSON chunk',
							error,
							payload
						)
					}

					const content = parsed?.choices?.[0]?.delta?.content
					if (typeof content === 'string' && content.length > 0) {
						yield content
					}
				}
			}

			buffered += decoder.decode()
			if (buffered.trim().length > 0) {
				const trailingLines = buffered.split(/\r?\n/)
				for (const rawLine of trailingLines) {
					const line = rawLine.trim()
					if (!line || line.startsWith(':')) continue
					if (!line.startsWith('data:')) continue
					const payload = line.slice(5).trim()
					if (!payload || payload === '[DONE]') continue
					let parsed: any
					try {
						parsed = JSON.parse(payload)
					} catch (error) {
						throw new InvokeError(
							InvokeErrorType.UNKNOWN,
							'Malformed streaming JSON chunk',
							error,
							payload
						)
					}
					const content = parsed?.choices?.[0]?.delta?.content
					if (typeof content === 'string' && content.length > 0) {
						yield content
					}
				}
			}
		} catch (error: unknown) {
			const isAbortError =
				(error as any)?.name === 'AbortError' || (error as any)?.rawError?.name === 'AbortError'
			if (isAbortError) {
				throw new InvokeError(InvokeErrorType.NETWORK_ERROR, 'Network request aborted', error)
			}
			if (error instanceof InvokeError) throw error
			throw new InvokeError(InvokeErrorType.NETWORK_ERROR, 'Streaming read failed', error)
		} finally {
			if (options?.signal) {
				options.signal.removeEventListener('abort', abortHandler)
			}
			reader.releaseLock()
		}
	}
}
