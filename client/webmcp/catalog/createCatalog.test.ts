import {
	createTLStore,
	defaultBindingUtils,
	defaultShapeUtils,
	defaultTools,
	Editor,
} from 'tldraw'
import { describe, expect, it } from 'vitest'
import { TldrawAgent } from '../../agent/TldrawAgent'
import { ALL_TOOL_NAMES, DISCOVERY_TOOL_NAMES } from '../toolNames'
import { createCatalog } from './createCatalog'

function createTestAgent() {
	const container = document.createElement('div')
	document.body.appendChild(container)
	const store = createTLStore({ shapeUtils: defaultShapeUtils })
	const editor = new Editor({
		store,
		shapeUtils: defaultShapeUtils,
		bindingUtils: defaultBindingUtils,
		tools: defaultTools,
		getContainer: () => container,
	})
	return new TldrawAgent({ editor, id: 'test-agent', onError: () => {} })
}

describe('createCatalog', () => {
	it('registers every tool name', () => {
		const catalog = createCatalog(createTestAgent())

		expect(catalog.size).toBe(ALL_TOOL_NAMES.length)
		for (const name of ALL_TOOL_NAMES) {
			expect(catalog.has(name), `missing catalog entry for ${name}`).toBe(true)
		}
	})

	it('marks discovery tools read-only', () => {
		const catalog = createCatalog(createTestAgent())

		for (const name of DISCOVERY_TOOL_NAMES) {
			expect(catalog.get(name)?.readOnly).toBe(true)
		}
	})

	it('requires confirm in destructive action schemas', () => {
		const catalog = createCatalog(createTestAgent())

		for (const name of ['delete', 'clear'] as const) {
			const schema = catalog.get(name)?.inputSchema
			expect(schema?.properties?.confirm).toMatchObject({ type: 'boolean' })
			expect(schema?.required ?? []).toContain('confirm')
		}
	})

	it('marks getInspiration as untrusted content', () => {
		const catalog = createCatalog(createTestAgent())
		expect(catalog.get('getInspiration')?.untrustedContent).toBe(true)
	})
})
