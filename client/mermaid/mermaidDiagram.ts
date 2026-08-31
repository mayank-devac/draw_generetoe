import { atom, createShapeId, Editor, TLShapeId } from 'tldraw'

export const MERMAID_SHAPE_TYPE = 'mermaid' as const

export type MermaidShapeProps = {
	w: number
	h: number
	title: string
	source: string
	svg: string
}

export type MermaidPreview = MermaidShapeProps & {
	shapeId: string
	diagramType: string
	pageId: string
}

export const mermaidEditorState = atom<{
	isOpen: boolean
	shapeId: TLShapeId | null
	pending: MermaidPreview | null
}>('mermaid editor state', { isOpen: false, shapeId: null, pending: null })

let initialized = false
let renderId = 0

export async function renderMermaidSource(source: string) {
	const trimmed = source.trim()
	if (!trimmed) throw new Error('Mermaid source is required.')

	const { default: mermaid } = await import('mermaid')
	if (!initialized) {
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: 'strict',
			htmlLabels: false,
			suppressErrorRendering: true,
			theme: 'neutral',
			themeVariables: { background: 'transparent' },
		})
		initialized = true
	}

	const parsed = await mermaid.parse(trimmed)
	const result = await mermaid.render(`mermaid-frame-${++renderId}`, trimmed)
	return { source: trimmed, svg: result.svg, diagramType: parsed.diagramType }
}

export async function previewMermaidDiagram(
	editor: Editor,
	input: {
		shapeId: string
		source: string
		title?: string
		w?: number
		h?: number
	},
	signal?: AbortSignal
) {
	if (editor.getIsReadonly()) throw new Error('The canvas is read-only.')
	if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')

	const rendered = await renderMermaidSource(input.source)
	if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
	const viewport = editor.getViewportPageBounds()
	const size = getMermaidFrameSize(viewport, input.w, input.h)
	const title = input.title?.trim() || 'Mermaid diagram'
	const preview: MermaidPreview = {
		shapeId: input.shapeId,
		pageId: editor.getCurrentPageId(),
		title,
		source: rendered.source,
		svg: rendered.svg,
		diagramType: rendered.diagramType,
		w: size.w,
		h: size.h,
	}
	mermaidEditorState.set({ isOpen: true, shapeId: null, pending: preview })

	const pages = editor.getPages()
	return {
		shapeId: input.shapeId,
		pageNumber: pages.findIndex((page) => page.id === editor.getCurrentPageId()) + 1,
		pageId: editor.getCurrentPageId(),
		title,
		diagramType: rendered.diagramType,
		w: size.w,
		h: size.h,
	}
}

export function addMermaidPreviewToCanvas(editor: Editor, preview: MermaidPreview) {
	if (editor.getIsReadonly()) throw new Error('The canvas is read-only.')
	if (preview.pageId !== editor.getCurrentPageId()) {
		throw new Error('Return to the page where this Mermaid preview was created before adding it.')
	}

	const viewport = editor.getViewportPageBounds()
	const shapeId = getUniqueShapeId(editor, preview.shapeId)
	editor.markHistoryStoppingPoint('adding Mermaid diagram')
	editor.createShape({
		id: shapeId,
		type: MERMAID_SHAPE_TYPE,
		x: viewport.x + (viewport.w - preview.w) / 2,
		y: viewport.y + (viewport.h - preview.h) / 2,
		props: {
			w: preview.w,
			h: preview.h,
			title: preview.title,
			source: preview.source,
			svg: preview.svg,
		},
		meta: { note: `Mermaid diagram: ${preview.title}` },
	})
	editor.select(shapeId)
	mermaidEditorState.set({ isOpen: true, shapeId, pending: null })
	return shapeId
}

export function updatePendingMermaidPreview(source: string, svg: string, diagramType: string) {
	const state = mermaidEditorState.get()
	if (!state.pending) return
	mermaidEditorState.set({
		...state,
		pending: { ...state.pending, source, svg, diagramType },
	})
}

export function openMermaidEditor(shapeId: TLShapeId) {
	mermaidEditorState.set({ isOpen: true, shapeId, pending: null })
}

export function closeMermaidEditor() {
	mermaidEditorState.set({ ...mermaidEditorState.get(), isOpen: false })
}

export function svgToDataUrl(svg: string) {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function formatMermaidError(error: unknown) {
	const message = error instanceof Error ? error.message : String(error)
	return message.split('\n').find((line) => line.trim())?.trim().slice(0, 300) || 'Invalid Mermaid syntax.'
}

function getUniqueShapeId(editor: Editor, requestedId: string) {
	let suffix = 1
	let shapeId = createShapeId(requestedId)
	while (editor.getShape(shapeId)) {
		suffix += 1
		shapeId = createShapeId(`${requestedId}-${suffix}`)
	}
	return shapeId
}

function getMermaidFrameSize(
	viewport: { w: number; h: number },
	requestedW?: number,
	requestedH?: number
) {
	const padding = Math.min(viewport.w, viewport.h) * 0.1
	const maxW = Math.max(360, Math.min(viewport.w - padding * 2, 1000))
	const maxH = Math.max(280, Math.min(viewport.h - padding * 2, 760))
	const w = requestedW ? Math.min(Math.max(requestedW, 320), maxW) : maxW
	const h = requestedH ? Math.min(Math.max(requestedH, 240), maxH) : maxH
	return { w, h }
}
