import type { ToolName } from './toolNames'
import type { JsonSchema } from './jsonSchema'

export type { JsonSchema } from './jsonSchema'

export type WebMcpExecutionContext = {
	signal?: AbortSignal
}

export type WebMcpTool = {
	name: string
	description: string
	inputSchema: JsonSchema
	execute: (input: unknown, context?: WebMcpExecutionContext) => unknown | Promise<unknown>
	annotations?: {
		readOnlyHint?: boolean
		untrustedContentHint?: boolean
	}
}

export type WebMcpModelContext = {
	registerTool: (tool: WebMcpTool, options: { signal: AbortSignal }) => void | Promise<void>
	getTools?: () => ReadonlyArray<{ name: string }> | Promise<ReadonlyArray<{ name: string }>>
}

export type CatalogEntry = {
	name: ToolName
	purpose: string
	inputSchema: JsonSchema
	execute: WebMcpTool['execute']
	readOnly: boolean
	untrustedContent: boolean
}

export type {
	ActionToolName,
	CameraToolName,
	CommonsToolName,
	EmbedToolName,
	GridToolName,
	MermaidToolName,
	PageToolName,
	ToolName,
} from './toolNames'
