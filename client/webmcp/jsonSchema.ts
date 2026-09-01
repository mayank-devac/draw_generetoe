export type JsonSchema = {
	[key: string]: unknown
	properties?: Record<string, JsonSchema>
	required?: readonly string[]
}
