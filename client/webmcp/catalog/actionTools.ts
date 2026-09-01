import { getAgentActionUtilsRecord } from '../../../shared/AgentUtils'
import { AgentActionUtil } from '../../../shared/actions/AgentActionUtil'
import { AgentAction } from '../../../shared/types/AgentAction'
import { TldrawAgent } from '../../agent/TldrawAgent'
import { ACTION_PURPOSES, ACTION_TOOL_NAMES, UNTRUSTED_ACTION_TOOL_NAMES, type ToolName } from '../constants'
import { createActionInputSchema, executeAction } from '../execute/executeAction'
import type { CatalogEntry } from '../types'

export function registerActionTools(agent: TldrawAgent, catalog: Map<ToolName, CatalogEntry>) {
	const actionUtils = getAgentActionUtilsRecord(agent)

	for (const name of ACTION_TOOL_NAMES) {
		const util = actionUtils[name] as AgentActionUtil<AgentAction>
		const actionSchema = util.getSchema()
		if (!actionSchema) {
			console.warn(`WebMCP action tool "${name}" has no schema and was not registered.`)
			continue
		}

		catalog.set(name, {
			name,
			purpose: ACTION_PURPOSES[name],
			inputSchema: createActionInputSchema(name, actionSchema),
			execute: (input, context) => executeAction(agent, util, actionSchema, name, input, context),
			readOnly: false,
			untrustedContent: UNTRUSTED_ACTION_TOOL_NAMES.has(name),
		})
	}
}
