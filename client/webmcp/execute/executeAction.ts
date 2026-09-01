import { z } from 'zod'
import { AgentHelpers } from '../../../shared/AgentHelpers'
import { AgentActionUtil } from '../../../shared/actions/AgentActionUtil'
import { AgentAction } from '../../../shared/types/AgentAction'
import { Streaming } from '../../../shared/types/Streaming'
import { TldrawAgent } from '../../agent/TldrawAgent'
import {
	ACTION_PURPOSES,
	PARAMETER_DESCRIPTIONS,
	type ActionToolName,
} from '../constants'
import type { JsonSchema } from '../jsonSchema'
import { DESTRUCTIVE_ACTION_TOOL_NAMES } from '../toolNames'
import { requireDestructiveConfirm, stripWebMcpOnlyFields } from '../registrationHelpers'
import { invalidArgumentsResult } from '../toolResults'
import type { WebMcpExecutionContext } from '../types'

export function createActionInputSchema(
	name: ActionToolName,
	actionSchema: NonNullable<ReturnType<AgentActionUtil<AgentAction>['getSchema']>>
) {
	const schema = structuredClone(z.toJSONSchema(actionSchema)) as JsonSchema
	const properties = { ...(schema.properties ?? {}) }
	delete properties._type

	for (const [parameter, description] of Object.entries(PARAMETER_DESCRIPTIONS[name])) {
		const property = properties[parameter]
		if (property) properties[parameter] = { ...property, description }
	}

	const required = (schema.required ?? []).filter((parameter) => parameter !== '_type')
	const inputSchema: JsonSchema = {
		...schema,
		type: 'object',
		additionalProperties: false,
		properties,
	}

	if (DESTRUCTIVE_ACTION_TOOL_NAMES.has(name)) {
		properties.confirm = {
			type: 'boolean',
			description: 'Must be true after explicit user approval to delete canvas content.',
		}
		required.push('confirm')
	}

	if (required.length > 0) inputSchema.required = required
	else delete inputSchema.required

	return inputSchema
}

export async function executeAction(
	agent: TldrawAgent,
	util: AgentActionUtil<AgentAction>,
	actionSchema: NonNullable<ReturnType<AgentActionUtil<AgentAction>['getSchema']>>,
	name: ActionToolName,
	input: unknown,
	context?: WebMcpExecutionContext
) {
	if (context?.signal?.aborted) return { ok: false, tool: name, error: 'Tool call was aborted.' }

	const confirmGate = requireDestructiveConfirm(name, input)
	if (!confirmGate.ok) {
		return { ok: false, tool: name, error: confirmGate.error, hint: confirmGate.hint }
	}

	const args = stripWebMcpOnlyFields(input)
	const parsed = actionSchema.safeParse({ ...args, _type: name })
	if (!parsed.success) return invalidArgumentsResult(name, parsed.error)

	try {
		const helpers = new AgentHelpers(agent)
		const action = { ...parsed.data, complete: true, time: 0 } as Streaming<AgentAction>
		const sanitizedAction = util.sanitizeAction(action, helpers)
		if (!sanitizedAction) {
			return { ok: false, tool: name, error: 'The action was rejected because its canvas targets are invalid.' }
		}

		const { promise } = agent.act(sanitizedAction, helpers, { recordChatHistory: false })
		if (promise) await promise

		return {
			ok: true,
			tool: name,
			summary: ACTION_PURPOSES[name],
			shapeCount: agent.editor.getCurrentPageShapes().length,
		}
	} catch (error) {
		return {
			ok: false,
			tool: name,
			error: error instanceof Error ? error.message : String(error),
		}
	}
}
