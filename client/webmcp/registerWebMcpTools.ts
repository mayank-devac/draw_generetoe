import { TldrawAgent } from '../agent/TldrawAgent'
import { createCatalog } from './catalog/createCatalog'
import { HOST_INPUT_STUB } from './constants'
import {
	getExistingToolNames,
	isDiscoveryToolName,
} from './registrationHelpers'
import { isAbortError, isDuplicateToolError } from './toolResults'
import type { WebMcpModelContext, WebMcpTool } from './types'

export async function registerWebMcpTools(agent: TldrawAgent, signal: AbortSignal) {
	if (typeof document === 'undefined') return { registered: 0, reused: 0 }

	const modelContext = (document as Document & { modelContext?: WebMcpModelContext }).modelContext
	if (!modelContext?.registerTool) return { registered: 0, reused: 0 }

	const catalog = createCatalog(agent)
	const existingNames = await getExistingToolNames(modelContext)
	let registered = 0
	let reused = 0

	for (const entry of catalog.values()) {
		if (signal.aborted) break
		if (existingNames.has(entry.name)) {
			reused += 1
			continue
		}

		const tool: WebMcpTool = {
			name: entry.name,
			description: entry.purpose,
			inputSchema: isDiscoveryToolName(entry.name) ? entry.inputSchema : HOST_INPUT_STUB,
			execute: entry.execute,
			annotations: {
				readOnlyHint: entry.readOnly,
				untrustedContentHint: entry.untrustedContent,
			},
		}

		try {
			await modelContext.registerTool(tool, { signal })
			registered += 1
		} catch (error) {
			if (isAbortError(error)) break
			if (isDuplicateToolError(error)) {
				reused += 1
				continue
			}
			console.warn(`Could not register WebMCP tool "${entry.name}".`, error)
		}
	}

	return { registered, reused }
}
