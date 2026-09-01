import { describe, expect, it } from 'vitest'
import { requireDestructiveConfirm } from './registrationHelpers'

describe('requireDestructiveConfirm', () => {
	it('blocks delete without confirm', () => {
		expect(requireDestructiveConfirm('delete', { shapeId: 'a' }).ok).toBe(false)
	})

	it('allows delete with confirm true', () => {
		expect(requireDestructiveConfirm('delete', { shapeId: 'a', confirm: true }).ok).toBe(true)
	})

	it('allows non-destructive tools without confirm', () => {
		expect(requireDestructiveConfirm('create', {}).ok).toBe(true)
	})

	it('blocks clear without confirm', () => {
		expect(requireDestructiveConfirm('clear', {}).ok).toBe(false)
	})
})
