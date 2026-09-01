import { z } from 'zod'
import type { ToolName } from './toolNames'

export function invalidArgumentsResult(name: ToolName, error: z.ZodError) {
	return {
		ok: false,
		tool: name,
		error: 'Invalid tool arguments.',
		issues: error.issues.map((issue) => ({
			path: issue.path.map(String).join('.'),
			message: issue.message,
		})),
	}
}

export function toolErrorResult(name: ToolName, error: unknown) {
	return {
		ok: false,
		tool: name,
		error: error instanceof Error ? error.message : String(error),
	}
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isAbortError(error: unknown) {
	return error instanceof DOMException && error.name === 'AbortError'
}

export function isDuplicateToolError(error: unknown) {
	if (error instanceof DOMException && error.name === 'InvalidStateError') return true
	const message = error instanceof Error ? error.message : String(error)
	return /already registered|duplicate tool name/i.test(message)
}
