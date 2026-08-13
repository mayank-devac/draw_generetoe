import { AnthropicProvider, AnthropicProviderOptions, createAnthropic } from '@ai-sdk/anthropic'
import {
	createGoogleGenerativeAI,
	GoogleGenerativeAIProvider,
	GoogleGenerativeAIProviderOptions,
} from '@ai-sdk/google'
import {
	createOpenAICompatible,
	OpenAICompatibleProvider,
	OpenAICompatibleProviderOptions,
} from '@ai-sdk/openai-compatible'
import { createOpenAI, OpenAIProvider, OpenAIResponsesProviderOptions } from '@ai-sdk/openai'
import { ProviderOptions } from '@ai-sdk/provider-utils'
import { LanguageModel, streamText } from 'ai'
import {
	AgentModelDefinition,
	AgentModelName,
	AgentModelProvider,
	AgentThinkingLevel,
	getAgentModelDefinition,
	PROVIDER_API_KEY_NAMES,
} from '../../shared/models'
import { AgentAction } from '../../shared/types/AgentAction'
import { AgentPrompt } from '../../shared/types/AgentPrompt'
import { AgentServerSentEvent } from '../../shared/types/Streaming'
import { normalizeActionEnvelope } from '../../shared/normalizeActionEnvelope'
import { Environment } from '../environment'
import { buildMessages } from '../prompt/buildMessages'
import { buildSystemPrompt } from '../prompt/buildSystemPrompt'
import { getModelSelection } from '../prompt/getModelName'
import { closeAndParseJson } from './closeAndParseJson'

const OPEN_CODE_BASE_URL = 'https://opencode.ai/zen/go/v1'
const JSON_PREFILL = '{"actions": [{"_type":'

export class AgentService {
	openai: OpenAIProvider
	anthropic: AnthropicProvider
	google: GoogleGenerativeAIProvider
	openCodeCompatible: OpenAICompatibleProvider
	openCodeOpenAI: OpenAIProvider
	openCodeAnthropic: AnthropicProvider
	configuredProviders: Set<AgentModelProvider>
	private readonly secretValues: string[]

	constructor(env: Environment) {
		this.openai = createOpenAI({ apiKey: env.OPENAI_API_KEY })
		this.anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })
		this.google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_API_KEY })
		this.openCodeCompatible = createOpenAICompatible({
			name: 'opencodeGo',
			apiKey: env.OPEN_CODE,
			baseURL: OPEN_CODE_BASE_URL,
		})
		this.openCodeOpenAI = createOpenAI({
			apiKey: env.OPEN_CODE,
			baseURL: OPEN_CODE_BASE_URL,
		})
		this.openCodeAnthropic = createAnthropic({
			apiKey: env.OPEN_CODE,
			baseURL: OPEN_CODE_BASE_URL,
		})

		const configuredProviders: AgentModelProvider[] = []
		if (env.OPENAI_API_KEY) configuredProviders.push('openai')
		if (env.ANTHROPIC_API_KEY) configuredProviders.push('anthropic')
		if (env.GOOGLE_API_KEY) configuredProviders.push('google')
		if (env.OPEN_CODE) configuredProviders.push('opencode-go')
		this.configuredProviders = new Set(configuredProviders)
		this.secretValues = [
			env.OPENAI_API_KEY,
			env.ANTHROPIC_API_KEY,
			env.GOOGLE_API_KEY,
			env.OPEN_CODE,
		].filter((value): value is string => Boolean(value))
	}

	getModel(modelName: AgentModelName): LanguageModel {
		const definition = getAgentModelDefinition(modelName)
		if (!this.configuredProviders.has(definition.provider)) {
			const keyName = PROVIDER_API_KEY_NAMES[definition.provider]
			const destination =
				definition.provider === 'opencode-go'
					? '.dev.vars for local development or Cloudflare secrets for production'
					: '.dev.vars or choose a configured model'
			throw new Error(`${keyName} is missing. Add it to ${destination}.`)
		}

		switch (definition.provider) {
			case 'google':
				return this.google(definition.id)
			case 'anthropic':
				return this.anthropic(definition.id)
			case 'openai':
				return definition.transport === 'openai-responses'
					? this.openai.responses(definition.id)
					: this.openai.chat(definition.id)
			case 'opencode-go':
				switch (definition.transport) {
					case 'anthropic-messages':
						return this.openCodeAnthropic(definition.id)
					case 'openai-responses':
						return this.openCodeOpenAI.responses(definition.id)
					case 'openai-chat':
						return this.openCodeCompatible(definition.id)
					default:
						throw new Error(`Unsupported OpenCode Go transport: ${definition.transport}`)
				}
		}
	}

	async *stream(
		prompt: AgentPrompt,
		onComplete?: (json: string) => void
	): AsyncGenerator<AgentServerSentEvent<AgentAction>> {
		const { modelName, thinkingLevel } = getModelSelection(prompt)
		const definition = getAgentModelDefinition(modelName)

		try {
			const model = this.getModel(modelName)
			for await (const event of streamActions(
				model,
				definition,
				thinkingLevel,
				prompt,
				onComplete
			)) {
				yield event
			}
		} catch (error) {
			const safeMessage = this.getSafeErrorMessage(error)
			const levelLabel = thinkingLevel ?? 'default behavior'
			console.error(
				`Stream error for ${definition.displayName} (${levelLabel}): ${safeMessage}`
			)
			throw new Error(
				`${definition.displayName} (${levelLabel}) request failed: ${safeMessage}`
			)
		}
	}

	private getSafeErrorMessage(error: unknown): string {
		let message = error instanceof Error ? error.message : 'Unknown provider error'
		for (const secret of this.secretValues) {
			message = message.split(secret).join('[REDACTED]')
		}
		return message.replace(/Bearer\s+[^\s,]+/gi, 'Bearer [REDACTED]')
	}
}

async function* streamActions(
	model: LanguageModel,
	definition: AgentModelDefinition,
	thinkingLevel: AgentThinkingLevel | null,
	prompt: AgentPrompt,
	onComplete?: (json: string) => void
): AsyncGenerator<AgentServerSentEvent<AgentAction>> {
	if (typeof model === 'string') {
		throw new Error('Model is a string, not a LanguageModel')
	}

	const messages = buildMessages(prompt)
	const systemPrompt = buildSystemPrompt(prompt)
	if (definition.usesAssistantPrefill) {
		messages.push({ role: 'assistant', content: JSON_PREFILL })
	}

	const result = streamText({
		model,
		system: systemPrompt,
		messages,
		maxOutputTokens: definition.maxOutputTokens,
		...(definition.supportsTemperature ? { temperature: 0 } : {}),
		providerOptions: getProviderOptions(definition, thinkingLevel),
		onError: ({ error }) => {
			throw error
		},
	})
	const { textStream } = result

	let buffer = definition.usesAssistantPrefill ? JSON_PREFILL : ''
	let cursor = 0
	let maybeIncompleteAction: AgentAction | null = null

	let startTime = Date.now()
	for await (const text of textStream) {
		buffer += text

		const partialObject = normalizeActionEnvelope(closeAndParseJson(buffer))
		yield {
			type: 'json',
			json: partialObject ? JSON.stringify(partialObject, null, 2) : buffer,
			complete: false,
		}
		if (!partialObject) continue
		const formattedJson = JSON.stringify(partialObject, null, 2)

		const actions = partialObject.actions
		if (!Array.isArray(actions)) continue
		if (actions.length === 0) continue

		// A provider may deliver several complete actions in one text chunk.
		// Drain all of them instead of assuming the list grows one action at a time.
		while (actions.length > cursor) {
			const completedAction = actions[cursor - 1] as AgentAction
			if (completedAction) {
				yield {
					...completedAction,
					complete: true,
					time: Date.now() - startTime,
					json: formattedJson,
				}
				maybeIncompleteAction = null
				startTime = Date.now()
			}
			cursor++
		}

		const action = actions[cursor - 1] as AgentAction
		if (action) {
			if (!maybeIncompleteAction) {
				startTime = Date.now()
			}

			maybeIncompleteAction = action
			yield {
				...action,
				complete: false,
				time: Date.now() - startTime,
				json: formattedJson,
			}
		}
	}

	if (maybeIncompleteAction) {
		const finalObject = normalizeActionEnvelope(closeAndParseJson(buffer))
		yield {
			...maybeIncompleteAction,
			complete: true,
			time: Date.now() - startTime,
			json: finalObject ? JSON.stringify(finalObject, null, 2) : buffer,
		}
	}
	const finalObject = normalizeActionEnvelope(closeAndParseJson(buffer))
	const finalJson = finalObject ? JSON.stringify(finalObject, null, 2) : buffer
	yield { type: 'json', json: finalJson, complete: true }
	if (onComplete) onComplete(finalJson)
	const usage = await result.usage
	yield {
		type: 'usage',
		usage: {
			inputTokens: usage.inputTokens ?? 0,
			outputTokens: usage.outputTokens ?? 0,
			reasoningTokens: usage.reasoningTokens ?? 0,
			cachedInputTokens: usage.cachedInputTokens ?? 0,
			totalTokens: usage.totalTokens ?? 0,
		},
	}
}

function getProviderOptions(
	definition: AgentModelDefinition,
	thinkingLevel: AgentThinkingLevel | null
): ProviderOptions {
	if (definition.provider === 'google') {
		return {
			google: {
				thinkingConfig: { thinkingBudget: definition.googleThinkingBudget },
			} satisfies GoogleGenerativeAIProviderOptions,
		}
	}

	if (definition.provider === 'anthropic') {
		return {
			anthropic: {
				thinking: { type: 'disabled' },
				cacheControl: { type: 'ephemeral', ttl: '1h' },
			} satisfies AnthropicProviderOptions,
		}
	}

	if (definition.provider !== 'opencode-go' || !thinkingLevel) return {}

	switch (definition.transport) {
		case 'anthropic-messages': {
			const budgetTokens = thinkingLevel === 'max' ? 131_071 : 65_536
			return {
				anthropic: {
					thinking: { type: 'enabled', budgetTokens },
					cacheControl: { type: 'ephemeral', ttl: '1h' },
				} satisfies AnthropicProviderOptions,
			}
		}
		case 'openai-responses':
			return {
				openai: {
					reasoningEffort: thinkingLevel,
				} satisfies OpenAIResponsesProviderOptions,
			}
		case 'openai-chat':
			if (thinkingLevel === 'default') return {}
			return {
				opencodeGo: {
					reasoningEffort: thinkingLevel,
				} satisfies OpenAICompatibleProviderOptions,
			}
		default:
			return {}
	}
}
