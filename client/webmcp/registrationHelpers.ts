import { DESTRUCTIVE_ACTION_TOOL_NAMES, DISCOVERY_TOOL_NAMES, type ActionToolName, type ToolName } from './toolNames'
import type { WebMcpModelContext } from './types'
import { isPlainObject } from './toolResults'

export async function getExistingToolNames(modelContext: WebMcpModelContext) {
	if (!modelContext.getTools) return new Set<string>()

	try {
		const tools = await modelContext.getTools()
		return new Set(tools.map((tool) => tool.name))
	} catch (error) {
		console.warn('Could not inspect existing WebMCP tools; registration will continue.', error)
		return new Set<string>()
	}
}

export function isDiscoveryToolName(name: ToolName) {
	return (DISCOVERY_TOOL_NAMES as readonly string[]).includes(name)
}

export function requireDestructiveConfirm(tool: string, input: unknown) {
	if (!DESTRUCTIVE_ACTION_TOOL_NAMES.has(tool as ActionToolName)) {
		return { ok: true as const }
	}

	const confirm = isPlainObject(input) ? input.confirm : undefined
	if (confirm === true) return { ok: true as const }

	return {
		ok: false as const,
		error: 'Destructive action requires confirm: true after the user approves deleting canvas content.',
		hint: 'Ask the user to confirm, then retry with confirm set to true.',
	}
}

export function stripWebMcpOnlyFields(input: unknown) {
	if (!isPlainObject(input)) return {}
	const { confirm: _confirm, ...rest } = input
	return rest
}
