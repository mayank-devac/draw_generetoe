import { z } from 'zod'
import { TldrawAgent } from '../../agent/TldrawAgent'
import type { JsonSchema } from '../jsonSchema'
import type { ToolName } from '../toolNames'
import { invalidArgumentsResult, isAbortError, toolErrorResult } from '../toolResults'
import type { CatalogEntry, WebMcpExecutionContext } from '../types'

export type CatalogRunContext = WebMcpExecutionContext & {
	agent: TldrawAgent
}

export type CatalogToolResult = Record<string, unknown>

export function defineCatalogTool<T>(
	agent: TldrawAgent,
	opts: {
		name: ToolName
		purpose: string
		inputSchema: JsonSchema
		parser: z.ZodType<T>
		run: (data: T, ctx: CatalogRunContext) => CatalogToolResult | Promise<CatalogToolResult>
		readOnly: boolean
		untrustedContent?: boolean
		checkAbort?: boolean
		defaultEmptyInput?: boolean
		beforeRun?: (data: T, ctx: CatalogRunContext) => CatalogToolResult | null
		catchAbort?: boolean
	}
): CatalogEntry {
	const {
		name,
		purpose,
		inputSchema,
		parser,
		run,
		readOnly,
		untrustedContent = false,
		checkAbort = false,
		defaultEmptyInput = false,
		beforeRun,
		catchAbort = false,
	} = opts

	return {
		name,
		purpose,
		inputSchema,
		readOnly,
		untrustedContent,
		execute: async (input, context) => {
			if (checkAbort && context?.signal?.aborted) {
				return { ok: false, tool: name, error: 'Tool call was aborted.' }
			}

			const parsed = parser.safeParse(defaultEmptyInput ? input ?? {} : input)
			if (!parsed.success) return invalidArgumentsResult(name, parsed.error)

			const ctx: CatalogRunContext = { agent, signal: context?.signal }

			if (beforeRun) {
				const blocked = beforeRun(parsed.data, ctx)
				if (blocked) return blocked
			}

			try {
				const result = await run(parsed.data, ctx)
				return { ok: true, tool: name, ...result }
			} catch (error) {
				if (catchAbort && isAbortError(error)) {
					return { ok: false, tool: name, error: 'Tool call was aborted.' }
				}
				return toolErrorResult(name, error)
			}
		},
	}
}
