import { describe, expect, it } from 'vitest'
import z from 'zod'
import { createActionInputSchema } from './executeAction'

describe('createActionInputSchema', () => {
	it('adds required confirm to delete schema', () => {
		const deleteSchema = z.object({
			_type: z.literal('delete'),
			intent: z.string(),
			shapeId: z.string(),
		})

		const schema = createActionInputSchema('delete', deleteSchema)

		expect(schema.properties?.confirm).toMatchObject({
			type: 'boolean',
			description: expect.stringContaining('user approval'),
		})
		expect(schema.required).toContain('confirm')
		expect(schema.additionalProperties).toBe(false)
	})

	it('adds required confirm to clear schema', () => {
		const clearSchema = z.object({ _type: z.literal('clear') })

		const schema = createActionInputSchema('clear', clearSchema)

		expect(schema.properties?.confirm).toMatchObject({ type: 'boolean' })
		expect(schema.required).toContain('confirm')
	})

	it('does not add confirm to non-destructive action schemas', () => {
		const countSchema = z.object({
			_type: z.literal('count'),
			expression: z.string(),
		})

		const schema = createActionInputSchema('count', countSchema)

		expect(schema.properties?.confirm).toBeUndefined()
		expect(schema.required ?? []).not.toContain('confirm')
	})
})
