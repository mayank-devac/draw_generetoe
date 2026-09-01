import { NEW_DRAW_PAGE_WORKFLOW, type ToolName } from '../constants'
import {
	DESCRIBE_TOOLS_INPUT_SCHEMA,
	DescribeToolsInput,
	LIST_TOOLS_INPUT_SCHEMA,
} from '../schemas/standaloneSchemas'
import { invalidArgumentsResult } from '../toolResults'
import type { CatalogEntry } from '../types'

export function registerDiscoveryTools(catalog: Map<ToolName, CatalogEntry>) {
	catalog.set('list_tools', {
		name: 'list_tools',
		purpose:
			'List every registered draw-app tool with a one-line summary and the required new-drawing page workflow; call this first to choose tools.',
		inputSchema: LIST_TOOLS_INPUT_SCHEMA,
		execute: () => ({
			workflow: NEW_DRAW_PAGE_WORKFLOW,
			tools: [...catalog.values()].map(({ name, purpose }) => ({ name, purpose })),
		}),
		readOnly: true,
		untrustedContent: false,
	})

	catalog.set('describe_tools', {
		name: 'describe_tools',
		purpose: 'Return full argument schemas for 1–10 unique tools before calling those compactly registered tools.',
		inputSchema: DESCRIBE_TOOLS_INPUT_SCHEMA,
		execute: (input) => {
			const parsed = DescribeToolsInput.safeParse(input)
			if (!parsed.success) return invalidArgumentsResult('describe_tools', parsed.error)

			return {
				tools: parsed.data.names.map((name) => {
					const entry = catalog.get(name)
					return entry
						? { name: entry.name, purpose: entry.purpose, inputSchema: entry.inputSchema }
						: { name, error: 'Tool is not registered.' }
				}),
			}
		},
		readOnly: true,
		untrustedContent: false,
	})
}
