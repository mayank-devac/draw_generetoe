import {
	Box,
	Editor,
	IndexKey,
	TLShape,
	TLShapeId,
	createShapeId,
	toRichText,
} from 'tldraw'
import {
	convertSimpleShapeToTldrawShape,
	SIMPLE_TO_GEO_TYPES,
} from '../../shared/format/convertSimpleShapeToTldrawShape'
import { SimpleShape, SimpleShapeSchema } from '../../shared/format/SimpleShape'
import { normalizeActionEnvelope } from '../../shared/normalizeActionEnvelope'

export type ParseCanvasImportResult = {
	shapes: SimpleShape[]
	warnings: string[]
}

export type ImportCanvasJsonResult = {
	imported: number
	skipped: number
	warnings: string[]
	shapeIds: TLShapeId[]
}

const IMPORTABLE_TYPES = new Set([
	'rectangle',
	'ellipse',
	'triangle',
	'diamond',
	'hexagon',
	'pill',
	'cloud',
	'x-box',
	'pentagon',
	'octagon',
	'star',
	'parallelogram-right',
	'parallelogram-left',
	'trapezoid',
	'fat-arrow-right',
	'fat-arrow-left',
	'fat-arrow-up',
	'fat-arrow-down',
	'check-box',
	'heart',
	'line',
	'text',
	'arrow',
	'note',
])

/**
 * Detect whether clipboard/file text looks like canvas shape JSON we can import.
 */
export function looksLikeCanvasImportJson(text: string): boolean {
	const trimmed = text.trim()
	if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false
	try {
		const { shapes } = parseCanvasImportJson(trimmed)
		return shapes.length > 0
	} catch {
		return false
	}
}

/**
 * Accept single shape, shape array, MCP read_canvas export, or create-action batches.
 */
export function parseCanvasImportJson(text: string): ParseCanvasImportResult {
	let data: unknown
	try {
		data = JSON.parse(text)
	} catch {
		throw new Error('Invalid JSON')
	}

	const warnings: string[] = []
	const candidates = collectShapeCandidates(data, warnings)
	const shapes: SimpleShape[] = []

	for (const candidate of candidates) {
		const parsed = SimpleShapeSchema.safeParse(candidate)
		if (!parsed.success) {
			warnings.push('Skipped one invalid shape object')
			continue
		}
		if (!IMPORTABLE_TYPES.has(parsed.data._type)) {
			warnings.push(`Skipped non-importable shape type: ${parsed.data._type}`)
			continue
		}
		shapes.push(parsed.data)
	}

	if (shapes.length === 0) {
		throw new Error(warnings[0] ?? 'No importable shapes found in JSON')
	}

	return { shapes, warnings }
}

export function importSimpleShapesAtViewportCenter(
	editor: Editor,
	shapes: SimpleShape[],
	extraWarnings: string[] = []
): ImportCanvasJsonResult {
	const warnings = [...extraWarnings]
	if (shapes.length === 0) {
		return { imported: 0, skipped: 0, warnings, shapeIds: [] }
	}

	const idMap = new Map<string, string>()
	const usedIds = new Set<string>()
	const remapped = shapes.map((shape) => {
		const shapeId = allocateUniqueId(shape.shapeId, editor, idMap, usedIds)
		return { ...shape, shapeId }
	})
	for (let i = 0; i < remapped.length; i++) {
		const shape = remapped[i]
		if (shape._type !== 'arrow') continue
		remapped[i] = {
			...shape,
			fromId: resolveLinkedId(shape.fromId, editor, idMap),
			toId: resolveLinkedId(shape.toId, editor, idMap),
		}
	}

	const bounds = getShapesBounds(remapped)
	const viewport = editor.getViewportPageBounds()
	const dx = bounds ? viewport.midX - bounds.midX : viewport.midX
	const dy = bounds ? viewport.midY - bounds.midY : viewport.midY
	const centered = remapped.map((shape) => offsetShape(shape, dx, dy))

	editor.markHistoryStoppingPoint('import-canvas-json')

	const shapeIds: TLShapeId[] = []
	let imported = 0
	let skipped = 0

	for (const shape of centered) {
		try {
			const result = convertSimpleShapeToTldrawShape(editor, shape, {
				defaultShape: getDefaultShape(shape._type),
			})
			editor.createShape(result.shape)
			shapeIds.push(result.shape.id)
			imported++

			if (result.bindings) {
				for (const binding of result.bindings) {
					editor.createBinding({
						type: binding.type,
						fromId: binding.fromId,
						toId: binding.toId,
						props: binding.props,
						meta: binding.meta,
					})
				}
			}
		} catch (error) {
			skipped++
			warnings.push(
				error instanceof Error ? error.message : `Failed to import shape ${shape.shapeId}`
			)
		}
	}

	if (shapeIds.length > 0) {
		editor.setSelectedShapes(shapeIds)
	}

	return { imported, skipped, warnings, shapeIds }
}

export function importCanvasJsonText(editor: Editor, text: string): ImportCanvasJsonResult {
	const { shapes, warnings } = parseCanvasImportJson(text)
	return importSimpleShapesAtViewportCenter(editor, shapes, warnings)
}

function collectShapeCandidates(data: unknown, warnings: string[]): unknown[] {
	if (Array.isArray(data)) {
		return data
	}

	if (!data || typeof data !== 'object') {
		return []
	}

	const record = normalizeActionEnvelope(data) ?? (data as Record<string, unknown>)

	if (typeof record._type === 'string' && 'shapeId' in record) {
		return [record]
	}

	if (Array.isArray(record.shapes)) {
		return record.shapes
	}

	if (Array.isArray(record.actions)) {
		const fromActions: unknown[] = []
		for (const action of record.actions) {
			if (!action || typeof action !== 'object') continue
			const item = action as Record<string, unknown>
			if (item._type === 'create' && item.shape) {
				fromActions.push(item.shape)
			} else if (item._type === 'update' && item.update) {
				fromActions.push(item.update)
				warnings.push('Converted an update action into a new shape on import')
			}
		}
		return fromActions
	}

	if (record.shape && typeof record.shape === 'object') {
		return [record.shape]
	}

	return []
}

function resolveLinkedId(
	preferred: string | null,
	editor: Editor,
	idMap: Map<string, string>
): string | null {
	if (!preferred) return null
	const key = preferred.replace(/^shape:/, '')
	const mapped = idMap.get(key)
	if (mapped) return mapped
	if (editor.getShape(`shape:${key}` as TLShapeId)) return key
	return null
}

function allocateUniqueId(
	preferred: string,
	editor: Editor,
	idMap: Map<string, string>,
	usedIds: Set<string>
): string {
	const key = preferred.replace(/^shape:/, '')
	const existing = idMap.get(key)
	if (existing) return existing

	let next =
		key ||
		createShapeId()
			.replace(/^shape:/, '')
			.slice(0, 12)

	while (editor.getShape(`shape:${next}` as TLShapeId) || usedIds.has(next)) {
		next = /\d+$/.test(next)
			? next.replace(/(\d+)(?=\D?)$/, (match) => String(Number(match) + 1))
			: `${next}-1`
	}

	idMap.set(key || next, next)
	usedIds.add(next)
	return next
}

function getShapesBounds(shapes: SimpleShape[]): Box | null {
	let bounds: Box | null = null
	for (const shape of shapes) {
		const next = getSimpleShapeBounds(shape)
		if (!next) continue
		bounds = bounds ? bounds.union(next) : next.clone()
	}
	return bounds
}

function getSimpleShapeBounds(shape: SimpleShape): Box | null {
	switch (shape._type) {
		case 'line':
		case 'arrow':
			return Box.FromPoints([
				{ x: shape.x1, y: shape.y1 },
				{ x: shape.x2, y: shape.y2 },
			])
		case 'text':
			return new Box(shape.x, shape.y, shape.width ?? Math.max(80, shape.text.length * 8), 40)
		case 'note':
			return new Box(shape.x, shape.y, 200, 200)
		case 'draw':
			return null
		case 'unknown':
			return new Box(shape.x, shape.y, 100, 100)
		default:
			return new Box(shape.x, shape.y, shape.w, shape.h)
	}
}

function offsetShape(shape: SimpleShape, dx: number, dy: number): SimpleShape {
	switch (shape._type) {
		case 'line':
		case 'arrow':
			return {
				...shape,
				x1: shape.x1 + dx,
				y1: shape.y1 + dy,
				x2: shape.x2 + dx,
				y2: shape.y2 + dy,
			}
		case 'draw':
			return shape
		default:
			return {
				...shape,
				x: shape.x + dx,
				y: shape.y + dy,
			}
	}
}

function getDefaultShape(shapeType: SimpleShape['_type']): Partial<TLShape> {
	const isGeo = shapeType in SIMPLE_TO_GEO_TYPES
	return isGeo
		? SHAPE_DEFAULTS.geo
		: (SHAPE_DEFAULTS[shapeType as keyof typeof SHAPE_DEFAULTS] ?? SHAPE_DEFAULTS.unknown)
}

const SHARED_DEFAULTS = {
	isLocked: false,
	opacity: 1,
	rotation: 0,
	meta: {},
}

const SHAPE_DEFAULTS = {
	text: {
		...SHARED_DEFAULTS,
		props: {
			autoSize: true,
			color: 'black',
			font: 'draw',
			richText: toRichText(''),
			scale: 1,
			size: 's',
			textAlign: 'start',
			w: 0,
		},
	},
	line: {
		...SHARED_DEFAULTS,
		props: {
			size: 's',
			color: 'black',
			dash: 'draw',
			points: {
				a1: { id: 'a1', index: 'a1' as IndexKey, x: 0, y: 0 },
				a2: { id: 'a2', index: 'a2' as IndexKey, x: 100, y: 0 },
			},
			scale: 1,
			spline: 'line',
		},
	},
	arrow: {
		...SHARED_DEFAULTS,
		props: {
			arrowheadEnd: 'arrow',
			arrowheadStart: 'none',
			bend: 0,
			color: 'black',
			dash: 'draw',
			elbowMidPoint: 0.5,
			end: { x: 100, y: 0 },
			fill: 'none',
			font: 'draw',
			kind: 'arc',
			labelColor: 'black',
			labelPosition: 0.5,
			richText: toRichText(''),
			scale: 1,
			size: 's',
			start: { x: 0, y: 0 },
		},
	},
	geo: {
		...SHARED_DEFAULTS,
		props: {
			align: 'middle',
			color: 'black',
			dash: 'draw',
			fill: 'none',
			font: 'draw',
			geo: 'rectangle',
			growY: 0,
			h: 100,
			labelColor: 'black',
			richText: toRichText(''),
			scale: 1,
			size: 's',
			url: '',
			verticalAlign: 'middle',
			w: 100,
		},
	},
	note: {
		...SHARED_DEFAULTS,
		props: {
			color: 'black',
			richText: toRichText(''),
			size: 's',
			align: 'middle',
			font: 'draw',
			fontSizeAdjustment: 0,
			growY: 0,
			labelColor: 'black',
			scale: 1,
			url: '',
			verticalAlign: 'middle',
		},
	},
	draw: {
		...SHARED_DEFAULTS,
		props: {},
	},
	unknown: {
		...SHARED_DEFAULTS,
		props: {},
	},
}
