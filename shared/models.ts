/**
 * The model registry is the single place to add, remove, or rename models.
 */
export type AgentModelProvider = 'openai' | 'anthropic' | 'google' | 'opencode-go'

export type AgentModelTransport =
	| 'openai-chat'
	| 'openai-responses'
	| 'anthropic-messages'
	| 'google-generative-ai'

export type AgentThinkingLevel = 'default' | 'medium' | 'high' | 'max'

export interface AgentThinkingOption {
	value: AgentThinkingLevel
	label: string
}

interface AgentModelDefinitionConfig {
	name: string
	displayName: string
	id: string
	provider: AgentModelProvider
	transport: AgentModelTransport
	supportsTemperature: boolean
	usesAssistantPrefill: boolean
	maxOutputTokens: number
	thinkingOptions: readonly AgentThinkingOption[]
	defaultThinkingLevel: AgentThinkingLevel | null
	googleThinkingBudget: number
}

export const AGENT_MODEL_DEFINITIONS = {
	'gemini-3.1-flash-lite': {
		name: 'gemini-3.1-flash-lite',
		displayName: 'Gemini 3.1 Flash Lite',
		id: 'gemini-3.1-flash-lite',
		provider: 'google',
		transport: 'google-generative-ai',
		supportsTemperature: true,
		usesAssistantPrefill: true,
		maxOutputTokens: 8192,
		thinkingOptions: [],
		defaultThinkingLevel: null,
		googleThinkingBudget: 0,
	},
	'gemini-2.5-flash-lite': {
		name: 'gemini-2.5-flash-lite',
		displayName: 'Gemini 2.5 Flash Lite',
		id: 'gemini-2.5-flash-lite',
		provider: 'google',
		transport: 'google-generative-ai',
		supportsTemperature: true,
		usesAssistantPrefill: true,
		maxOutputTokens: 8192,
		thinkingOptions: [],
		defaultThinkingLevel: null,
		googleThinkingBudget: 0,
	},
	'gemini-2.5-pro': {
		name: 'gemini-2.5-pro',
		displayName: 'Gemini 2.5 Pro',
		id: 'gemini-2.5-pro',
		provider: 'google',
		transport: 'google-generative-ai',
		supportsTemperature: true,
		usesAssistantPrefill: true,
		maxOutputTokens: 8192,
		thinkingOptions: [],
		defaultThinkingLevel: null,
		googleThinkingBudget: 128,
	},
	'claude-4.5-sonnet': {
		name: 'claude-4.5-sonnet',
		displayName: 'Claude 4.5 Sonnet',
		id: 'claude-sonnet-4-5',
		provider: 'anthropic',
		transport: 'anthropic-messages',
		supportsTemperature: true,
		usesAssistantPrefill: true,
		maxOutputTokens: 8192,
		thinkingOptions: [],
		defaultThinkingLevel: null,
		googleThinkingBudget: 0,
	},
	'qwen3.8-max': {
		name: 'qwen3.8-max',
		displayName: 'Qwen3.8 Max',
		id: 'qwen3.8-max',
		provider: 'opencode-go',
		transport: 'anthropic-messages',
		supportsTemperature: true,
		// Qwen emits a complete JSON document even when given an assistant prefill.
		usesAssistantPrefill: false,
		maxOutputTokens: 131_072,
		thinkingOptions: [
			{ value: 'high', label: 'High' },
			{ value: 'max', label: 'Max' },
		],
		defaultThinkingLevel: 'high',
		googleThinkingBudget: 0,
	},
	'grok-4.5': {
		name: 'grok-4.5',
		displayName: 'Grok 4.5',
		id: 'grok-4.5',
		provider: 'opencode-go',
		transport: 'openai-chat',
		supportsTemperature: true,
		usesAssistantPrefill: true,
		maxOutputTokens: 8192,
		thinkingOptions: [
			{ value: 'medium', label: 'Medium' },
			{ value: 'high', label: 'High' },
		],
		defaultThinkingLevel: 'medium',
		googleThinkingBudget: 0,
	},
	'gpt-5.6-luna': {
		name: 'gpt-5.6-luna',
		displayName: 'GPT-5.6 Luna',
		id: 'gpt-5.6-luna',
		provider: 'opencode-go',
		transport: 'openai-responses',
		supportsTemperature: false,
		usesAssistantPrefill: false,
		maxOutputTokens: 8192,
		thinkingOptions: [
			{ value: 'medium', label: 'Medium' },
			{ value: 'high', label: 'High' },
		],
		defaultThinkingLevel: 'high',
		googleThinkingBudget: 0,
	},
	'kimi-k3': {
		name: 'kimi-k3',
		displayName: 'Kimi K3',
		id: 'kimi-k3',
		provider: 'opencode-go',
		transport: 'openai-chat',
		supportsTemperature: false,
		usesAssistantPrefill: true,
		maxOutputTokens: 8192,
		thinkingOptions: [
			{ value: 'default', label: 'Default' },
			{ value: 'max', label: 'Max' },
		],
		defaultThinkingLevel: 'default',
		googleThinkingBudget: 0,
	},
} as const satisfies Record<string, AgentModelDefinitionConfig>

export type AgentModelName = keyof typeof AGENT_MODEL_DEFINITIONS

export interface AgentModelDefinition extends Omit<AgentModelDefinitionConfig, 'name'> {
	name: AgentModelName
}

export const DEFAULT_MODEL_NAME: AgentModelName = 'gpt-5.6-luna'

export const PROVIDER_API_KEY_NAMES: Record<AgentModelProvider, string> = {
	openai: 'OPENAI_API_KEY',
	anthropic: 'ANTHROPIC_API_KEY',
	google: 'GOOGLE_API_KEY',
	'opencode-go': 'OPEN_CODE',
}

export function isValidModelName(value: unknown): value is AgentModelName {
	return typeof value === 'string' && value in AGENT_MODEL_DEFINITIONS
}

export function getAgentModelDefinition(modelName: AgentModelName): AgentModelDefinition {
	const definition = AGENT_MODEL_DEFINITIONS[modelName]
	if (!definition) throw new Error(`Model ${modelName} not found`)
	return definition
}

export function isThinkingLevelSupported(
	modelName: AgentModelName,
	value: unknown
): value is AgentThinkingLevel {
	return getAgentModelDefinition(modelName).thinkingOptions.some((option) => option.value === value)
}

export function getDefaultThinkingLevel(modelName: AgentModelName): AgentThinkingLevel | null {
	return getAgentModelDefinition(modelName).defaultThinkingLevel
}
