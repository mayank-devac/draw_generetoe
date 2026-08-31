import { Editor, PageRecordType, TLPage } from 'tldraw'
import {
	convertTldrawIdToSimpleId,
	convertTldrawShapeToSimpleType,
} from '../../shared/format/convertTldrawShapeToSimpleShape'

export type PageSummary = {
	pageNumber: number
	pageId: string
	name: string
	isCurrent: boolean
	objectCount: number
}

export function createCanvasPage(editor: Editor) {
	if (editor.getIsReadonly()) throw new Error('The canvas is read-only.')

	const pages = editor.getPages()
	if (pages.length >= editor.options.maxPages) {
		throw new Error(`The canvas already has the maximum of ${editor.options.maxPages} pages.`)
	}

	const pageId = PageRecordType.createId()
	editor.run(() => {
		editor.markHistoryStoppingPoint('creating page')
		editor.createPage({ id: pageId })
		if (editor.getPage(pageId)) editor.setCurrentPage(pageId)
	})

	const page = editor.getPage(pageId)
	if (!page) throw new Error('The new page could not be created.')

	const nextPages = editor.getPages()
	return {
		page: summarizePage(editor, page, nextPages),
		totalPages: nextPages.length,
		maxPages: editor.options.maxPages,
	}
}

export function inspectCanvasPages(editor: Editor, pageNumber?: number) {
	const pages = editor.getPages()
	const summaries = pages.map((page) => summarizePage(editor, page, pages))
	const currentPageNumber = pages.findIndex((page) => page.id === editor.getCurrentPageId()) + 1
	const result = {
		currentPageNumber,
		totalPages: pages.length,
		maxPages: editor.options.maxPages,
		pages: summaries,
	}

	if (pageNumber === undefined) return result

	const page = pages[pageNumber - 1]
	if (!page) return result

	return {
		...result,
		inspectedPage: {
			...summaries[pageNumber - 1],
			objects: [...editor.getPageShapeIds(page)]
				.map((shapeId) => editor.getShape(shapeId))
				.filter((shape) => shape !== undefined)
				.map((shape) => {
					const type = convertTldrawShapeToSimpleType(shape)
					return type === 'unknown'
						? { shapeId: convertTldrawIdToSimpleId(shape.id), type, subType: shape.type }
						: { shapeId: convertTldrawIdToSimpleId(shape.id), type }
				})
				.sort((a, b) => a.shapeId.localeCompare(b.shapeId)),
		},
	}
}

function summarizePage(editor: Editor, page: TLPage, pages: TLPage[]): PageSummary {
	return {
		pageNumber: pages.findIndex((candidate) => candidate.id === page.id) + 1,
		pageId: page.id,
		name: page.name,
		isCurrent: page.id === editor.getCurrentPageId(),
		objectCount: editor.getPageShapeIds(page).size,
	}
}
