import {
	createShapeId,
	createTLStore,
	defaultBindingUtils,
	defaultShapeUtils,
	defaultTools,
	Editor,
} from 'tldraw'
import { describe, expect, it } from 'vitest'
import { convertTldrawIdToSimpleId } from '../../shared/format/convertTldrawShapeToSimpleShape'
import { createCanvasPage, inspectCanvasPages } from './pageTools'

function createTestEditor() {
	const container = document.createElement('div')
	document.body.appendChild(container)
	const store = createTLStore({ shapeUtils: defaultShapeUtils })
	return new Editor({
		store,
		shapeUtils: defaultShapeUtils,
		bindingUtils: defaultBindingUtils,
		tools: defaultTools,
		getContainer: () => container,
	})
}

describe('inspectCanvasPages', () => {
	it('reports one empty page on a fresh editor', () => {
		const editor = createTestEditor()
		const result = inspectCanvasPages(editor)

		expect(result.totalPages).toBe(1)
		expect(result.currentPageNumber).toBe(1)
		expect(result.pages[0]?.objectCount).toBe(0)
	})

	it('lists shape ids and types for a requested page', () => {
		const editor = createTestEditor()
		const shapeId = createShapeId('test-geo')

		editor.run(() => {
			editor.createShape({
				id: shapeId,
				type: 'geo',
				x: 10,
				y: 20,
				props: {
					geo: 'rectangle',
					w: 100,
					h: 80,
					color: 'black',
					fill: 'none',
					dash: 'draw',
					size: 'm',
				},
			})
		})

		const result = inspectCanvasPages(editor, 1)
		expect('inspectedPage' in result && result.inspectedPage?.objects).toEqual([
			{ shapeId: convertTldrawIdToSimpleId(shapeId), type: 'rectangle' },
		])
	})
})

describe('createCanvasPage', () => {
	it('creates and switches to a new page', () => {
		const editor = createTestEditor()
		const before = inspectCanvasPages(editor)

		const created = createCanvasPage(editor)
		const after = inspectCanvasPages(editor)

		expect(created.totalPages).toBe(before.totalPages + 1)
		expect(after.totalPages).toBe(before.totalPages + 1)
		expect(created.page.isCurrent).toBe(true)
		expect(after.currentPageNumber).toBe(created.page.pageNumber)
	})
})
