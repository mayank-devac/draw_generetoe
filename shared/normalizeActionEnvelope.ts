type JsonObject = Record<string, unknown>

function isJsonObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Recover the exact envelope produced when a provider ignores an assistant
 * JSON prefill and starts a second, complete { actions: [...] } document.
 */
export function normalizeActionEnvelope(value: unknown): JsonObject | null {
	if (!isJsonObject(value)) return null
	if (!Array.isArray(value.actions) || value.actions.length !== 1) return value

	const wrapper = value.actions[0]
	if (!isJsonObject(wrapper) || !isJsonObject(wrapper._type)) return value
	if (!Array.isArray(wrapper._type.actions)) return value

	return {
		...value,
		actions: wrapper._type.actions,
	}
}
