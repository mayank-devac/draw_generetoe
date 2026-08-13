import { z } from 'zod'

export const MCP_BRIDGE_PORT = 3001
export const MCP_CANVAS_PATH = '/canvas'
export const MCP_ENDPOINT = `http://127.0.0.1:${MCP_BRIDGE_PORT}/mcp`
export const MCP_CANVAS_URL = `ws://127.0.0.1:${MCP_BRIDGE_PORT}${MCP_CANVAS_PATH}`

export const MAX_MCP_ACTIONS = 100
export const MAX_PEN_POINTS_PER_ACTION = 2_000
export const MAX_TOTAL_PEN_POINTS = 5_000

const coordinate = z.number().finite().min(-1_000_000).max(1_000_000)
const dimension = z.number().finite().positive().max(100_000)
const shapeId = z
	.string()
	.min(1)
	.max(128)
	.regex(/^[A-Za-z0-9_-]+$/, 'Shape IDs may contain letters, numbers, underscores, and hyphens')
const note = z.string().max(1_000).default('')
const text = z.string().max(10_000)
const intent = z.string().max(500).optional()
const color = z.enum([
	'red',
	'light-red',
	'green',
	'light-green',
	'blue',
	'light-blue',
	'orange',
	'yellow',
	'black',
	'violet',
	'light-violet',
	'grey',
	'white',
])
const fill = z.enum(['none', 'tint', 'background', 'solid', 'pattern'])
const textAlign = z.enum(['start', 'middle', 'end'])

const geoShape = z.strictObject({
	_type: z.enum([
		'rectangle',
		'ellipse',
		'triangle',
		'diamond',
		'hexagon',
		'pill',
		'cloud',
		'x-box',
		'check-box',
		'heart',
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
	]),
	shapeId,
	x: coordinate,
	y: coordinate,
	w: dimension,
	h: dimension,
	color,
	fill,
	note,
	text: text.optional(),
	textAlign: textAlign.optional(),
})

const lineShape = z.strictObject({
	_type: z.literal('line'),
	shapeId,
	x1: coordinate,
	y1: coordinate,
	x2: coordinate,
	y2: coordinate,
	color,
	note,
})

const noteShape = z.strictObject({
	_type: z.literal('note'),
	shapeId,
	x: coordinate,
	y: coordinate,
	color,
	note,
	text: text.optional(),
})

const textShape = z.strictObject({
	_type: z.literal('text'),
	shapeId,
	x: coordinate,
	y: coordinate,
	color,
	note,
	text,
	fontSize: z.number().finite().positive().max(1_000).optional(),
	textAlign: textAlign.optional(),
	width: dimension.optional(),
	wrap: z.boolean().optional(),
})

const arrowShape = z.strictObject({
	_type: z.literal('arrow'),
	shapeId,
	x1: coordinate,
	y1: coordinate,
	x2: coordinate,
	y2: coordinate,
	color,
	note,
	fromId: shapeId.nullable(),
	toId: shapeId.nullable(),
	text: text.optional(),
	bend: z.number().finite().min(-10_000).max(10_000).optional(),
})

export const McpEditableShapeSchema = z.union([
	geoShape,
	lineShape,
	textShape,
	arrowShape,
	noteShape,
])

const createAction = z.strictObject({
	_type: z.literal('create'),
	intent,
	shape: McpEditableShapeSchema,
})

const updateAction = z.strictObject({
	_type: z.literal('update'),
	intent,
	update: McpEditableShapeSchema,
})

const labelAction = z.strictObject({
	_type: z.literal('label'),
	intent,
	shapeId,
	text,
})

const moveAction = z.strictObject({
	_type: z.literal('move'),
	intent,
	shapeId,
	x: coordinate,
	y: coordinate,
})

const resizeAction = z.strictObject({
	_type: z.literal('resize'),
	intent,
	shapeIds: z.array(shapeId).min(1).max(100),
	originX: coordinate,
	originY: coordinate,
	scaleX: z.number().finite().min(0.01).max(100),
	scaleY: z.number().finite().min(0.01).max(100),
})

const rotateAction = z.strictObject({
	_type: z.literal('rotate'),
	intent,
	shapeIds: z.array(shapeId).min(1).max(100),
	originX: coordinate,
	originY: coordinate,
	centerY: coordinate.default(0),
	degrees: z.number().finite().min(-3_600).max(3_600),
})

const alignAction = z.strictObject({
	_type: z.literal('align'),
	intent,
	shapeIds: z.array(shapeId).min(2).max(100),
	alignment: z.enum(['top', 'bottom', 'left', 'right', 'center-horizontal', 'center-vertical']),
	gap: z.number().finite().min(0).max(100_000).default(0),
})

const distributeAction = z.strictObject({
	_type: z.literal('distribute'),
	intent,
	shapeIds: z.array(shapeId).min(3).max(100),
	direction: z.enum(['horizontal', 'vertical']),
})

const stackAction = z.strictObject({
	_type: z.literal('stack'),
	intent,
	shapeIds: z.array(shapeId).min(2).max(100),
	direction: z.enum(['horizontal', 'vertical']),
	gap: z.number().finite().min(0).max(100_000),
})

const reorderAction = z.union([
	z.strictObject({
		_type: z.literal('bringToFront'),
		intent,
		shapeIds: z.array(shapeId).min(1).max(100),
	}),
	z.strictObject({
		_type: z.literal('sendToBack'),
		intent,
		shapeIds: z.array(shapeId).min(1).max(100),
	}),
])

const penAction = z.strictObject({
	_type: z.literal('pen'),
	intent,
	color,
	fill,
	closed: z.boolean(),
	style: z.enum(['smooth', 'straight']),
	points: z
		.array(z.strictObject({ x: coordinate, y: coordinate }))
		.min(2)
		.max(MAX_PEN_POINTS_PER_ACTION),
})

const deleteAction = z.strictObject({
	_type: z.literal('delete'),
	intent,
	shapeId,
})

const clearAction = z.strictObject({ _type: z.literal('clear') })

export const McpCanvasActionSchema = z.union([
	createAction,
	updateAction,
	labelAction,
	moveAction,
	resizeAction,
	rotateAction,
	alignAction,
	distributeAction,
	stackAction,
	reorderAction,
	penAction,
	deleteAction,
	clearAction,
])

export const ReadCanvasInputSchema = z.strictObject({
	includeImage: z.boolean().default(true),
})

export const ApplyCanvasChangesInputSchema = z
	.strictObject({
		summary: z.string().min(1).max(500),
		actions: z.array(McpCanvasActionSchema).min(1).max(MAX_MCP_ACTIONS),
	})
	.superRefine(({ actions }, context) => {
		const totalPoints = actions.reduce(
			(total, action) => total + (action._type === 'pen' ? action.points.length : 0),
			0
		)
		if (totalPoints > MAX_TOTAL_PEN_POINTS) {
			context.addIssue({
				code: 'custom',
				message: `A batch may contain at most ${MAX_TOTAL_PEN_POINTS} freehand points`,
				path: ['actions'],
			})
		}
	})

export const UndoLastAiChangeInputSchema = z.strictObject({})

export type McpCanvasAction = z.infer<typeof McpCanvasActionSchema>
export type ApplyCanvasChangesInput = z.infer<typeof ApplyCanvasChangesInputSchema>

export interface CanvasReadResult {
	connected: true
	shapes: unknown[]
	selectedShapeIds: string[]
	viewport: { x: number; y: number; w: number; h: number }
	imageDataUrl?: string
}

export interface CanvasApplyResult {
	createdShapeIds: string[]
	changedShapeIds: string[]
	deletedShapeIds: string[]
	warnings: string[]
	undoAvailable: boolean
}

export interface CanvasUndoResult {
	undone: boolean
	message: string
	undoAvailable: boolean
}

export type BridgeRequestMethod = 'read_canvas' | 'apply_canvas_changes' | 'undo_last_ai_change'

export type ServerToCanvasMessage =
	| { type: 'status'; assistantConnected: boolean }
	| { type: 'request'; id: string; method: BridgeRequestMethod; payload: unknown }

export type CanvasToServerMessage =
	| { type: 'hello'; version: 1 }
	| { type: 'response'; id: string; result?: unknown; error?: { code: string; message: string } }
