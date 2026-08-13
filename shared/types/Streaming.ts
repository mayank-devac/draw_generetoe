/**
 * An object that is currently being streamed to the user, so may or may not be complete.
 * If it's not yet complete, the object will be a partial and `complete` will be set to false.
 * If it's complete, the object will be the full object and `complete` will be set to true.
 *
 * The object also has a property for how many milliseconds have passed since the streaming started.
 */
export type Streaming<T> =
	| (Partial<T> & { complete: false; time: number })
	| (T & { complete: true; time: number })

/** A streamed action together with the model's latest formatted JSON output. */
export type AgentStreamEvent<T> = Streaming<T> & { json: string }

/** A JSON-only update emitted even before a complete action can be parsed. */
export interface AgentJsonStreamEvent {
	type: 'json'
	json: string
	complete: boolean
}

export interface AgentTokenUsage {
	inputTokens: number
	outputTokens: number
	reasoningTokens: number
	cachedInputTokens: number
	totalTokens: number
}

export interface AgentUsageStreamEvent {
	type: 'usage'
	usage: AgentTokenUsage
}

export type AgentServerSentEvent<T> =
	| AgentStreamEvent<T>
	| AgentJsonStreamEvent
	| AgentUsageStreamEvent
