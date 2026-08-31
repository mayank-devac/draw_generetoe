import { createShapeId, Editor, TLShape, TLShapeId } from 'tldraw'

const SIZE_TOLERANCE = 0.75
const RATIO_TOLERANCE = 0.01
const MAX_NORMALIZATION_PASSES = 3

export function arrangeGrid(
	editor: Editor,
	input: {
		shapeIds: string[]
		columns?: number
		gap?: number
		targetWidth?: number
		fitCamera?: boolean
	}
) {
	if (editor.getIsReadonly()) throw new Error('The canvas is read-only.')

	const currentPageId = editor.getCurrentPageId()
	const shapes = input.shapeIds.map((simpleId) => {
		const shapeId = createShapeId(simpleId)
		const shape = editor.getShape(shapeId)
		if (!shape) throw new Error(`Shape ${simpleId} does not exist.`)
		if (shape.parentId !== currentPageId) {
			throw new Error(`Shape ${simpleId} must be a top-level shape on the current page.`)
		}

		const util = editor.getShapeUtil(shape)
		if (!util.canResize(shape)) throw new Error(`Shape ${simpleId} cannot be resized.`)
		const geometryBounds = editor.getShapeGeometry(shape).bounds
		return {
			simpleId,
			shapeId,
			shape,
			locked: util.isAspectRatioLocked(shape),
			ratio: geometryBounds.w / geometryBounds.h,
		}
	})

	const initialBounds = shapes.map(({ shapeId, simpleId }) => ({
		simpleId,
		shapeId,
		bounds: requireBounds(editor, shapeId, simpleId),
	}))
	const lockedRatios = shapes.filter(({ locked }) => locked).map(({ ratio }) => ratio)
	const lockedRatio = compatibleLockedRatio(lockedRatios)
	const ratios = shapes.map(({ ratio }) => ratio).sort((a, b) => a - b)
	const representativeRatio = lockedRatio ?? ratios[Math.floor(ratios.length / 2)]
	let targetWidth = input.targetWidth ?? 600
	let targetHeight = targetWidth / representativeRatio
	let passes = 0

	const readingOrder = initialBounds
		.slice()
		.sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x)
	const anchorX = Math.min(...initialBounds.map(({ bounds }) => bounds.x))
	const anchorY = Math.min(...initialBounds.map(({ bounds }) => bounds.y))
	const columns = Math.min(input.columns ?? Math.ceil(Math.sqrt(shapes.length)), shapes.length)
	const rows = Math.ceil(shapes.length / columns)
	const gap = input.gap ?? 50

	editor.markHistoryStoppingPoint('arranging equal-size grid')
	editor.run(() => {
		for (const { shape } of shapes) {
			if (shape.rotation !== 0) {
				editor.updateShape({ id: shape.id, type: shape.type, rotation: 0 })
			}
		}

		for (passes = 1; passes <= MAX_NORMALIZATION_PASSES; passes += 1) {
			resizeAll(editor, shapes, targetWidth, targetHeight)
			const actualBounds = shapes.map(({ shapeId, simpleId }) =>
				requireBounds(editor, shapeId, simpleId)
			)
			if (allBoundsMatch(actualBounds, targetWidth, targetHeight)) break

			if (lockedRatio) {
				targetWidth = Math.max(
					targetWidth,
					...actualBounds.map((bounds) => bounds.w),
					...actualBounds.map((bounds) => bounds.h * lockedRatio)
				)
				targetHeight = targetWidth / lockedRatio
			} else {
				targetWidth = Math.max(targetWidth, ...actualBounds.map((bounds) => bounds.w))
				targetHeight = Math.max(targetHeight, ...actualBounds.map((bounds) => bounds.h))
			}
		}

		const normalizedBounds = shapes.map(({ shapeId, simpleId }) =>
			requireBounds(editor, shapeId, simpleId)
		)
		if (!allBoundsMatch(normalizedBounds, targetWidth, targetHeight)) {
			throw new Error('The selected shapes could not converge on one common size.')
		}

		for (const [index, item] of readingOrder.entries()) {
			const row = Math.floor(index / columns)
			const column = index % columns
			const bounds = requireBounds(editor, item.shapeId, item.simpleId)
			moveTopLevelShape(
				editor,
				editor.getShape(item.shapeId)!,
				anchorX + column * (targetWidth + gap) - bounds.x,
				anchorY + row * (targetHeight + gap) - bounds.y
			)
		}
	})

	if (input.fitCamera !== false) editor.zoomToFit()

	return {
		shapeIds: readingOrder.map(({ simpleId }) => simpleId),
		columns,
		rows,
		gap,
		width: targetWidth,
		height: targetHeight,
		normalizationPasses: passes,
		fitCamera: input.fitCamera !== false,
		rotationsNormalized: true,
		positions: readingOrder.map(({ simpleId, shapeId }) => {
			const bounds = requireBounds(editor, shapeId, simpleId)
			return { shapeId: simpleId, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
		}),
	}
}

function resizeAll(
	editor: Editor,
	shapes: Array<{ shapeId: TLShapeId; simpleId: string }>,
	targetWidth: number,
	targetHeight: number
) {
	for (const { shapeId, simpleId } of shapes) {
		const bounds = requireBounds(editor, shapeId, simpleId)
		editor.resizeShape(
			shapeId,
			{ x: targetWidth / bounds.w, y: targetHeight / bounds.h },
			{ scaleOrigin: { x: bounds.x, y: bounds.y } }
		)
	}
}

function moveTopLevelShape(editor: Editor, shape: TLShape, dx: number, dy: number) {
	editor.updateShape({ id: shape.id, type: shape.type, x: shape.x + dx, y: shape.y + dy })
}

function requireBounds(editor: Editor, shapeId: TLShapeId, simpleId: string) {
	const bounds = editor.getShapePageBounds(shapeId)
	if (!bounds || bounds.w <= 0 || bounds.h <= 0) {
		throw new Error(`Shape ${simpleId} does not have measurable bounds.`)
	}
	return bounds
}

function compatibleLockedRatio(ratios: number[]) {
	if (ratios.length === 0) return null
	const reference = ratios[0]
	if (ratios.some((ratio) => Math.abs(ratio / reference - 1) > RATIO_TOLERANCE)) {
		throw new Error('Selected aspect-ratio-locked shapes have incompatible proportions.')
	}
	return ratios.reduce((total, ratio) => total + ratio, 0) / ratios.length
}

function allBoundsMatch(
	bounds: Array<{ w: number; h: number }>,
	targetWidth: number,
	targetHeight: number
) {
	return bounds.every(
		(item) =>
			Math.abs(item.w - targetWidth) <= SIZE_TOLERANCE &&
			Math.abs(item.h - targetHeight) <= SIZE_TOLERANCE
	)
}
