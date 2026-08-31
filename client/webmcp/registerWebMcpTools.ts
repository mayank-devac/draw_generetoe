import { z } from 'zod'
import { AgentHelpers } from '../../shared/AgentHelpers'
import { getAgentActionUtilsRecord } from '../../shared/AgentUtils'
import { AgentActionUtil } from '../../shared/actions/AgentActionUtil'
import { AgentAction } from '../../shared/types/AgentAction'
import { Streaming } from '../../shared/types/Streaming'
import { TldrawAgent } from '../agent/TldrawAgent'
import { searchCommonsImages } from '../commons/commonsImages'
import { insertCommonsImage } from '../commons/insertCommonsImage'
import { previewMermaidDiagram } from '../mermaid/mermaidDiagram'
import { createCanvasPage, inspectCanvasPages } from './pageTools'

type JsonSchema = {
	[key: string]: unknown
	properties?: Record<string, JsonSchema>
	required?: readonly string[]
}

type WebMcpExecutionContext = {
	signal?: AbortSignal
}

type WebMcpTool = {
	name: string
	description: string
	inputSchema: JsonSchema
	execute: (input: unknown, context?: WebMcpExecutionContext) => unknown | Promise<unknown>
	annotations?: {
		readOnlyHint?: boolean
		untrustedContentHint?: boolean
	}
}

type WebMcpModelContext = {
	registerTool: (tool: WebMcpTool, options: { signal: AbortSignal }) => void | Promise<void>
	getTools?: () => ReadonlyArray<{ name: string }> | Promise<ReadonlyArray<{ name: string }>>
}

const ACTION_TOOL_NAMES = [
	'review',
	'create',
	'createHtmlPreview',
	'delete',
	'update',
	'label',
	'move',
	'place',
	'bringToFront',
	'sendToBack',
	'rotate',
	'resize',
	'align',
	'distribute',
	'stack',
	'clear',
	'pen',
	'getInspiration',
	'count',
] as const satisfies readonly AgentAction['_type'][]

const COMMONS_TOOL_NAMES = ['search_commons_images', 'add_commons_image'] as const
const MERMAID_TOOL_NAMES = ['create_mermaid_diagram'] as const
const PAGE_TOOL_NAMES = ['create_page', 'inspect_pages'] as const
const DISCOVERY_TOOL_NAMES = ['list_tools', 'describe_tools'] as const
const ALL_TOOL_NAMES = [
	...ACTION_TOOL_NAMES,
	...COMMONS_TOOL_NAMES,
	...MERMAID_TOOL_NAMES,
	...PAGE_TOOL_NAMES,
	...DISCOVERY_TOOL_NAMES,
] as const

type ActionToolName = (typeof ACTION_TOOL_NAMES)[number]
type CommonsToolName = (typeof COMMONS_TOOL_NAMES)[number]
type MermaidToolName = (typeof MERMAID_TOOL_NAMES)[number]
type PageToolName = (typeof PAGE_TOOL_NAMES)[number]
type ToolName = (typeof ALL_TOOL_NAMES)[number]

const ACTION_PURPOSES: Record<ActionToolName, string> = {
	review: 'Review a canvas region and schedule a follow-up turn when more work may be needed.',
	create: 'Create one new canvas shape from the app\'s existing simple-shape format.',
	createHtmlPreview: 'Create a visible interactive HTML preview shape in the current canvas view.',
	delete: 'Delete one existing canvas shape by its simple shape ID.',
	update: 'Update the properties of one existing canvas shape.',
	label: 'Replace the visible text on one existing canvas shape.',
	move: 'Move one existing shape so its page bounds begin at the requested coordinates.',
	place: 'Place one shape on a chosen side of another shape with alignment and offsets.',
	bringToFront: 'Bring one or more existing shapes in front of the other canvas content.',
	sendToBack: 'Send one or more existing shapes behind the other canvas content.',
	rotate: 'Rotate one or more existing shapes around a supplied canvas origin.',
	resize: 'Scale one or more existing shapes around a supplied canvas origin.',
	align: 'Align existing shapes to one shared edge or center axis.',
	distribute: 'Distribute existing shapes evenly on the horizontal or vertical axis.',
	stack: 'Pack existing shapes horizontally or vertically using a requested gap.',
	clear: 'Delete every shape on the current canvas page.',
	pen: 'Draw a visible freehand or straight-point path, optionally closed and filled.',
	getInspiration: 'Fetch a random Wikipedia article and schedule it as inspiration for a follow-up turn.',
	count: 'Count the current page shapes and schedule the answer for a follow-up turn.',
}

const COMMONS_PURPOSES: Record<CommonsToolName, string> = {
	search_commons_images:
		'Search Wikimedia Commons for up to six verified CC0 or public-domain images before choosing one to add.',
	add_commons_image:
		'Re-verify and add one Commons image at exact canvas coordinates with a grouped visible credit.',
}

const MERMAID_PURPOSES: Record<MermaidToolName, string> = {
	create_mermaid_diagram:
		'Render Mermaid source in the top preview panel so the user can inspect or edit it and choose whether to add it to the canvas. Follow the new-drawing page workflow first.',
}

const NEW_DRAW_PAGE_WORKFLOW =
	'Before starting a new drawing, call inspect_pages. If the current page contains objects, call create_page and draw on the new page. If it is empty, reuse the current page.'

const PAGE_PURPOSES: Record<PageToolName, string> = {
	create_page: `Create and switch to a new automatically named canvas page. ${NEW_DRAW_PAGE_WORKFLOW}`,
	inspect_pages: `List current and all canvas pages with object counts, or inspect object IDs and types for one 1-based page number. ${NEW_DRAW_PAGE_WORKFLOW}`,
}

const PARAMETER_DESCRIPTIONS: Record<ActionToolName, Record<string, string>> = {
	review: {
		intent: 'Why this region should be reviewed and what the follow-up should check.',
		x: 'Left coordinate of the canvas region to review.',
		y: 'Top coordinate of the canvas region to review.',
		w: 'Width of the canvas region to review.',
		h: 'Height of the canvas region to review.',
	},
	create: {
		intent: 'Short reason for creating the shape.',
		shape: 'Complete simple-shape object to create on the canvas.',
	},
	createHtmlPreview: {
		intent: 'Short reason for creating the interactive preview.',
		shapeId: 'Simple ID requested for the new preview shape.',
		title: 'Short title displayed on the HTML preview shape.',
		html: 'Self-contained HTML with inline CSS and JavaScript.',
		w: 'Requested preview width; the app constrains it to the viewport.',
		h: 'Requested preview height; the app constrains it to the viewport.',
	},
	delete: {
		intent: 'Short reason for deleting the shape.',
		shapeId: 'Simple ID of the existing shape to delete.',
	},
	update: {
		intent: 'Short reason for updating the shape.',
		update: 'Complete simple-shape object containing the existing shape ID and updated properties.',
	},
	label: {
		intent: 'Short reason for changing the label.',
		shapeId: 'Simple ID of the existing shape whose text should change.',
		text: 'Replacement text for the shape.',
	},
	move: {
		intent: 'Short reason for moving the shape.',
		shapeId: 'Simple ID of the existing shape to move.',
		x: 'Target left coordinate for the shape bounds.',
		y: 'Target top coordinate for the shape bounds.',
	},
	place: {
		align: 'How to align the moved shape along the reference shape: start, center, or end.',
		alignOffset: 'Offset along the alignment axis.',
		intent: 'Short reason for placing the shape.',
		referenceShapeId: 'Simple ID of the stationary reference shape.',
		side: 'Side of the reference shape: top, bottom, left, or right.',
		sideOffset: 'Distance between the moved shape and the reference shape.',
		shapeId: 'Simple ID of the existing shape to place.',
	},
	bringToFront: {
		intent: 'Short reason for changing the shapes\' z-order.',
		shapeIds: 'Simple IDs of the existing shapes to bring to the front.',
	},
	sendToBack: {
		intent: 'Short reason for changing the shapes\' z-order.',
		shapeIds: 'Simple IDs of the existing shapes to send to the back.',
	},
	rotate: {
		centerY: 'Existing required action field retained for compatibility.',
		degrees: 'Clockwise rotation in degrees.',
		intent: 'Short reason for rotating the shapes.',
		originX: 'Canvas X coordinate of the rotation origin.',
		originY: 'Canvas Y coordinate of the rotation origin.',
		shapeIds: 'Simple IDs of the existing shapes to rotate.',
	},
	resize: {
		intent: 'Short reason for resizing the shapes.',
		originX: 'Canvas X coordinate of the resize origin.',
		originY: 'Canvas Y coordinate of the resize origin.',
		scaleX: 'Horizontal scale multiplier.',
		scaleY: 'Vertical scale multiplier.',
		shapeIds: 'Simple IDs of the existing shapes to resize.',
	},
	align: {
		alignment: 'Shared edge or center axis: top, bottom, left, right, center-horizontal, or center-vertical.',
		gap: 'Existing required action field retained for compatibility.',
		intent: 'Short reason for aligning the shapes.',
		shapeIds: 'Simple IDs of the existing shapes to align.',
	},
	distribute: {
		direction: 'Distribution axis: horizontal or vertical.',
		intent: 'Short reason for distributing the shapes.',
		shapeIds: 'Simple IDs of the existing shapes to distribute.',
	},
	stack: {
		direction: 'Stacking axis: horizontal or vertical.',
		gap: 'Non-negative distance placed between stacked shapes.',
		intent: 'Short reason for stacking the shapes.',
		shapeIds: 'Simple IDs of the existing shapes to stack.',
	},
	clear: {},
	pen: {
		color: 'Canvas color name for the path.',
		closed: 'Whether to close the path by joining its final point to its first point.',
		fill: 'Fill style: none, tint, background, solid, or pattern.',
		intent: 'Short reason for drawing the path.',
		points: 'Ordered canvas points that form the path.',
		style: 'Path interpolation style: smooth or straight.',
	},
	getInspiration: {},
	count: {
		expression: 'Natural-language description of what should be counted.',
	},
}

const HOST_INPUT_STUB: JsonSchema = Object.freeze({
	type: 'object',
	description: 'Full args: describe_tools({names}).',
	additionalProperties: true,
	properties: Object.freeze({}),
})

const SEARCH_COMMONS_IMAGES_INPUT_SCHEMA: JsonSchema = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: Object.freeze(['query']),
	properties: Object.freeze({
		query: Object.freeze({
			type: 'string',
			minLength: 2,
			maxLength: 80,
			description: 'Short descriptive Commons file search query.',
		}),
	}),
}) as JsonSchema

const ADD_COMMONS_IMAGE_INPUT_SCHEMA: JsonSchema = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: Object.freeze(['pageId', 'x', 'y']),
	properties: Object.freeze({
		pageId: Object.freeze({
			type: 'integer',
			minimum: 1,
			description: 'Verified Commons pageId returned by search_commons_images.',
		}),
		x: Object.freeze({
			type: 'number',
			description: 'Exact canvas X coordinate for the image top-left.',
		}),
		y: Object.freeze({
			type: 'number',
			description: 'Exact canvas Y coordinate for the image top-left.',
		}),
		maxWidth: Object.freeze({
			type: 'number',
			minimum: 64,
			maximum: 1600,
			description: 'Optional maximum displayed image width. Default 640.',
		}),
		maxHeight: Object.freeze({
			type: 'number',
			minimum: 64,
			maximum: 1200,
			description: 'Optional maximum displayed image height. Default 480.',
		}),
	}),
}) as JsonSchema

const CREATE_MERMAID_DIAGRAM_INPUT_SCHEMA: JsonSchema = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: Object.freeze(['shapeId', 'source']),
	properties: Object.freeze({
		shapeId: Object.freeze({
			type: 'string',
			minLength: 1,
			maxLength: 100,
			description: 'Requested simple shape ID for the new Mermaid frame.',
		}),
		source: Object.freeze({
			type: 'string',
			minLength: 1,
			maxLength: 50000,
			description: 'Complete Mermaid diagram source, including its diagram declaration.',
		}),
		title: Object.freeze({
			type: 'string',
			minLength: 1,
			maxLength: 120,
			description: 'Optional short frame title. Default Mermaid diagram.',
		}),
		w: Object.freeze({
			type: 'number',
			minimum: 320,
			maximum: 1600,
			description: 'Optional requested frame width, constrained to the current viewport.',
		}),
		h: Object.freeze({
			type: 'number',
			minimum: 240,
			maximum: 1200,
			description: 'Optional requested frame height, constrained to the current viewport.',
		}),
	}),
}) as JsonSchema

const CREATE_PAGE_INPUT_SCHEMA: JsonSchema = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: Object.freeze({}),
})

const INSPECT_PAGES_INPUT_SCHEMA: JsonSchema = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: Object.freeze({
		pageNumber: Object.freeze({
			type: 'integer',
			minimum: 1,
			description: 'Optional 1-based page number whose object IDs and types should be returned.',
		}),
	}),
})

const LIST_TOOLS_INPUT_SCHEMA: JsonSchema = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: Object.freeze({}),
})

const DESCRIBE_TOOLS_INPUT_SCHEMA: JsonSchema = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: Object.freeze(['names']),
	properties: Object.freeze({
		names: Object.freeze({
			type: 'array',
			minItems: 1,
			maxItems: 10,
			uniqueItems: true,
			description: 'Unique registered tool names to describe, returned in this order.',
			items: Object.freeze({ type: 'string', enum: Object.freeze([...ALL_TOOL_NAMES]) }),
		}),
	}),
}) as JsonSchema

const DescribeToolsInput = z.object({
	names: z
		.array(z.enum(ALL_TOOL_NAMES))
		.min(1)
		.max(10)
		.refine((names) => new Set(names).size === names.length, 'Tool names must be unique.'),
})

const SearchCommonsImagesInput = z
	.object({
		query: z.string().trim().min(2).max(80),
	})
	.strict()

const AddCommonsImageInput = z
	.object({
		pageId: z.number().int().positive(),
		x: z.number().finite(),
		y: z.number().finite(),
		maxWidth: z.number().finite().min(64).max(1600).optional(),
		maxHeight: z.number().finite().min(64).max(1200).optional(),
	})
	.strict()

const CreateMermaidDiagramInput = z
	.object({
		shapeId: z.string().trim().min(1).max(100),
		source: z.string().trim().min(1).max(50000),
		title: z.string().trim().min(1).max(120).optional(),
		w: z.number().finite().min(320).max(1600).optional(),
		h: z.number().finite().min(240).max(1200).optional(),
	})
	.strict()

const CreatePageInput = z.object({}).strict()

const InspectPagesInput = z
	.object({
		pageNumber: z.number().int().positive().optional(),
	})
	.strict()

type CatalogEntry = {
	name: ToolName
	purpose: string
	inputSchema: JsonSchema
	execute: WebMcpTool['execute']
	readOnly: boolean
	untrustedContent: boolean
}

export async function registerWebMcpTools(agent: TldrawAgent, signal: AbortSignal) {
	if (typeof document === 'undefined') return { registered: 0, reused: 0 }

	const modelContext = (document as Document & { modelContext?: WebMcpModelContext }).modelContext
	if (!modelContext?.registerTool) return { registered: 0, reused: 0 }

	const catalog = createCatalog(agent)
	const existingNames = await getExistingToolNames(modelContext)
	let registered = 0
	let reused = 0

	for (const entry of catalog.values()) {
		if (signal.aborted) break
		if (existingNames.has(entry.name)) {
			reused += 1
			continue
		}

		const tool: WebMcpTool = {
			name: entry.name,
			description: entry.purpose,
			inputSchema: isDiscoveryToolName(entry.name) ? entry.inputSchema : HOST_INPUT_STUB,
			execute: entry.execute,
			annotations: {
				readOnlyHint: entry.readOnly,
				untrustedContentHint: entry.untrustedContent,
			},
		}

		try {
			await modelContext.registerTool(tool, { signal })
			registered += 1
		} catch (error) {
			if (isAbortError(error)) break
			if (isDuplicateToolError(error)) {
				reused += 1
				continue
			}
			console.warn(`Could not register WebMCP tool "${entry.name}".`, error)
		}
	}

	return { registered, reused }
}

function createCatalog(agent: TldrawAgent) {
	const actionUtils = getAgentActionUtilsRecord(agent)
	const catalog = new Map<ToolName, CatalogEntry>()

	for (const name of ACTION_TOOL_NAMES) {
		const util = actionUtils[name] as AgentActionUtil<AgentAction>
		const actionSchema = util.getSchema()
		if (!actionSchema) continue

		catalog.set(name, {
			name,
			purpose: ACTION_PURPOSES[name],
			inputSchema: createActionInputSchema(name, actionSchema),
			execute: (input, context) => executeAction(agent, util, actionSchema, name, input, context),
			readOnly: false,
			untrustedContent: false,
		})
	}

	catalog.set('search_commons_images', {
		name: 'search_commons_images',
		purpose: COMMONS_PURPOSES.search_commons_images,
		inputSchema: SEARCH_COMMONS_IMAGES_INPUT_SCHEMA,
		execute: async (input, context) => {
			const parsed = SearchCommonsImagesInput.safeParse(input)
			if (!parsed.success) return invalidArgumentsResult('search_commons_images', parsed.error)

			try {
				const images = await searchCommonsImages(parsed.data.query, context?.signal)
				return {
					ok: true,
					tool: 'search_commons_images',
					query: parsed.data.query,
					count: images.length,
					images,
				}
			} catch (error) {
				return toolErrorResult('search_commons_images', error)
			}
		},
		readOnly: true,
		untrustedContent: true,
	})

	catalog.set('add_commons_image', {
		name: 'add_commons_image',
		purpose: COMMONS_PURPOSES.add_commons_image,
		inputSchema: ADD_COMMONS_IMAGE_INPUT_SCHEMA,
		execute: async (input, context) => {
			const parsed = AddCommonsImageInput.safeParse(input)
			if (!parsed.success) return invalidArgumentsResult('add_commons_image', parsed.error)

			try {
				const result = await insertCommonsImage(agent.editor, parsed.data, context?.signal)
				return { ok: true, tool: 'add_commons_image', ...result }
			} catch (error) {
				return toolErrorResult('add_commons_image', error)
			}
		},
		readOnly: false,
		untrustedContent: true,
	})

	catalog.set('create_mermaid_diagram', {
		name: 'create_mermaid_diagram',
		purpose: MERMAID_PURPOSES.create_mermaid_diagram,
		inputSchema: CREATE_MERMAID_DIAGRAM_INPUT_SCHEMA,
		execute: async (input, context) => {
			if (context?.signal?.aborted) {
				return { ok: false, tool: 'create_mermaid_diagram', error: 'Tool call was aborted.' }
			}

			const parsed = CreateMermaidDiagramInput.safeParse(input)
			if (!parsed.success) return invalidArgumentsResult('create_mermaid_diagram', parsed.error)

			try {
				const result = await previewMermaidDiagram(
					agent.editor,
					parsed.data,
					context?.signal
				)
				return { ok: true, tool: 'create_mermaid_diagram', ...result }
			} catch (error) {
				if (isAbortError(error)) {
					return { ok: false, tool: 'create_mermaid_diagram', error: 'Tool call was aborted.' }
				}
				return toolErrorResult('create_mermaid_diagram', error)
			}
		},
		readOnly: false,
		untrustedContent: false,
	})

	catalog.set('create_page', {
		name: 'create_page',
		purpose: PAGE_PURPOSES.create_page,
		inputSchema: CREATE_PAGE_INPUT_SCHEMA,
		execute: (input, context) => {
			if (context?.signal?.aborted) {
				return { ok: false, tool: 'create_page', error: 'Tool call was aborted.' }
			}

			const parsed = CreatePageInput.safeParse(input ?? {})
			if (!parsed.success) return invalidArgumentsResult('create_page', parsed.error)

			try {
				return { ok: true, tool: 'create_page', ...createCanvasPage(agent.editor) }
			} catch (error) {
				return toolErrorResult('create_page', error)
			}
		},
		readOnly: false,
		untrustedContent: false,
	})

	catalog.set('inspect_pages', {
		name: 'inspect_pages',
		purpose: PAGE_PURPOSES.inspect_pages,
		inputSchema: INSPECT_PAGES_INPUT_SCHEMA,
		execute: (input, context) => {
			if (context?.signal?.aborted) {
				return { ok: false, tool: 'inspect_pages', error: 'Tool call was aborted.' }
			}

			const parsed = InspectPagesInput.safeParse(input ?? {})
			if (!parsed.success) return invalidArgumentsResult('inspect_pages', parsed.error)

			const totalPages = agent.editor.getPages().length
			if (parsed.data.pageNumber !== undefined && parsed.data.pageNumber > totalPages) {
				return {
					ok: false,
					tool: 'inspect_pages',
					error: `Page number ${parsed.data.pageNumber} does not exist.`,
					totalPages,
				}
			}

			return {
				ok: true,
				tool: 'inspect_pages',
				...inspectCanvasPages(agent.editor, parsed.data.pageNumber),
			}
		},
		readOnly: true,
		untrustedContent: false,
	})

	catalog.set('list_tools', {
		name: 'list_tools',
		purpose:
			'List every registered draw-app tool with a one-line summary and the required new-drawing page workflow; call this first to choose tools.',
		inputSchema: LIST_TOOLS_INPUT_SCHEMA,
		execute: () => ({
			workflow: NEW_DRAW_PAGE_WORKFLOW,
			tools: [...catalog.values()].map(({ name, purpose }) => ({ name, purpose })),
		}),
		readOnly: true,
		untrustedContent: false,
	})

	catalog.set('describe_tools', {
		name: 'describe_tools',
		purpose: 'Return full argument schemas for 1–10 unique tools before calling those compactly registered tools.',
		inputSchema: DESCRIBE_TOOLS_INPUT_SCHEMA,
		execute: (input) => {
			const parsed = DescribeToolsInput.safeParse(input)
			if (!parsed.success) return invalidArgumentsResult('describe_tools', parsed.error)

			return {
				tools: parsed.data.names.map((name) => {
					const entry = catalog.get(name)
					return entry
						? { name: entry.name, purpose: entry.purpose, inputSchema: entry.inputSchema }
						: { name, error: 'Tool is not registered.' }
				}),
			}
		},
		readOnly: true,
		untrustedContent: false,
	})

	return catalog
}

function createActionInputSchema(
	name: ActionToolName,
	actionSchema: NonNullable<ReturnType<AgentActionUtil<AgentAction>['getSchema']>>
) {
	const schema = structuredClone(z.toJSONSchema(actionSchema)) as JsonSchema
	const properties = { ...(schema.properties ?? {}) }
	delete properties._type

	for (const [parameter, description] of Object.entries(PARAMETER_DESCRIPTIONS[name])) {
		const property = properties[parameter]
		if (property) properties[parameter] = { ...property, description }
	}

	const required = (schema.required ?? []).filter((parameter) => parameter !== '_type')
	const inputSchema: JsonSchema = {
		...schema,
		type: 'object',
		additionalProperties: false,
		properties,
	}

	if (required.length > 0) inputSchema.required = required
	else delete inputSchema.required

	return inputSchema
}

async function executeAction(
	agent: TldrawAgent,
	util: AgentActionUtil<AgentAction>,
	actionSchema: NonNullable<ReturnType<AgentActionUtil<AgentAction>['getSchema']>>,
	name: ActionToolName,
	input: unknown,
	context?: WebMcpExecutionContext
) {
	if (context?.signal?.aborted) return { ok: false, tool: name, error: 'Tool call was aborted.' }

	const args = isPlainObject(input) ? input : {}
	const parsed = actionSchema.safeParse({ ...args, _type: name })
	if (!parsed.success) return invalidArgumentsResult(name, parsed.error)

	try {
		const helpers = new AgentHelpers(agent)
		const action = { ...parsed.data, complete: true, time: 0 } as Streaming<AgentAction>
		const sanitizedAction = util.sanitizeAction(action, helpers)
		if (!sanitizedAction) {
			return { ok: false, tool: name, error: 'The action was rejected because its canvas targets are invalid.' }
		}

		const { promise } = agent.act(sanitizedAction, helpers, { recordChatHistory: false })
		if (promise) await promise

		return {
			ok: true,
			tool: name,
			summary: ACTION_PURPOSES[name],
			shapeCount: agent.editor.getCurrentPageShapes().length,
		}
	} catch (error) {
		return {
			ok: false,
			tool: name,
			error: error instanceof Error ? error.message : String(error),
		}
	}
}

function invalidArgumentsResult(name: ToolName, error: z.ZodError) {
	return {
		ok: false,
		tool: name,
		error: 'Invalid tool arguments.',
		issues: error.issues.map((issue) => ({
			path: issue.path.map(String).join('.'),
			message: issue.message,
		})),
	}
}

function toolErrorResult(name: ToolName, error: unknown) {
	return {
		ok: false,
		tool: name,
		error: error instanceof Error ? error.message : String(error),
	}
}

async function getExistingToolNames(modelContext: WebMcpModelContext) {
	if (!modelContext.getTools) return new Set<string>()

	try {
		const tools = await modelContext.getTools()
		return new Set(tools.map((tool) => tool.name))
	} catch (error) {
		console.warn('Could not inspect existing WebMCP tools; registration will continue.', error)
		return new Set<string>()
	}
}

function isDiscoveryToolName(name: ToolName) {
	return (DISCOVERY_TOOL_NAMES as readonly string[]).includes(name)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAbortError(error: unknown) {
	return error instanceof DOMException && error.name === 'AbortError'
}

function isDuplicateToolError(error: unknown) {
	if (error instanceof DOMException && error.name === 'InvalidStateError') return true
	const message = error instanceof Error ? error.message : String(error)
	return /already registered|duplicate tool name/i.test(message)
}
