import { getAgentActionUtilsRecord } from '../../../shared/AgentUtils'
import { AgentActionUtil } from '../../../shared/actions/AgentActionUtil'
import { AgentAction } from '../../../shared/types/AgentAction'
import { zoomOutCanvas } from '../../../shared/zoomOutCanvas'
import { TldrawAgent } from '../../agent/TldrawAgent'
import { searchCommonsImages } from '../../commons/commonsImages'
import { insertCommonsImage } from '../../commons/insertCommonsImage'
import { previewMermaidDiagram } from '../../mermaid/mermaidDiagram'
import {
	ACTION_PURPOSES,
	ACTION_TOOL_NAMES,
	CAMERA_PURPOSES,
	COMMONS_PURPOSES,
	EMBED_PURPOSES,
	GRID_PURPOSES,
	MERMAID_PURPOSES,
	NEW_DRAW_PAGE_WORKFLOW,
	PAGE_PURPOSES,
	UNTRUSTED_ACTION_TOOL_NAMES,
	type ToolName,
} from '../constants'
import { inspectEmbeds } from '../embedTools'
import { createActionInputSchema, executeAction } from '../execute/executeAction'
import { arrangeGrid } from '../gridTools'
import { createCanvasPage, inspectCanvasPages } from '../pageTools'
import {
	ADD_COMMONS_IMAGE_INPUT_SCHEMA,
	ARRANGE_GRID_INPUT_SCHEMA,
	AddCommonsImageInput,
	ArrangeGridInput,
	CREATE_MERMAID_DIAGRAM_INPUT_SCHEMA,
	CREATE_PAGE_INPUT_SCHEMA,
	CreateMermaidDiagramInput,
	CreatePageInput,
	DESCRIBE_TOOLS_INPUT_SCHEMA,
	DescribeToolsInput,
	INSPECT_EMBEDS_INPUT_SCHEMA,
	INSPECT_PAGES_INPUT_SCHEMA,
	InspectEmbedsInput,
	InspectPagesInput,
	LIST_TOOLS_INPUT_SCHEMA,
	SEARCH_COMMONS_IMAGES_INPUT_SCHEMA,
	SearchCommonsImagesInput,
	ZOOM_OUT_INPUT_SCHEMA,
	ZoomOutInput,
} from '../schemas/standaloneSchemas'
import { invalidArgumentsResult, isAbortError, toolErrorResult } from '../toolResults'
import type { CatalogEntry } from '../types'

export function createCatalog(agent: TldrawAgent) {
	const actionUtils = getAgentActionUtilsRecord(agent)
	const catalog = new Map<ToolName, CatalogEntry>()

	for (const name of ACTION_TOOL_NAMES) {
		const util = actionUtils[name] as AgentActionUtil<AgentAction>
		const actionSchema = util.getSchema()
		if (!actionSchema) {
			console.warn(`WebMCP action tool "${name}" has no schema and was not registered.`)
			continue
		}

		catalog.set(name, {
			name,
			purpose: ACTION_PURPOSES[name],
			inputSchema: createActionInputSchema(name, actionSchema),
			execute: (input, context) => executeAction(agent, util, actionSchema, name, input, context),
			readOnly: false,
			untrustedContent: UNTRUSTED_ACTION_TOOL_NAMES.has(name),
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
				const result = await previewMermaidDiagram(agent.editor, parsed.data, context?.signal)
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

	catalog.set('inspect_embeds', {
		name: 'inspect_embeds',
		purpose: EMBED_PURPOSES.inspect_embeds,
		inputSchema: INSPECT_EMBEDS_INPUT_SCHEMA,
		execute: (input, context) => {
			if (context?.signal?.aborted) {
				return { ok: false, tool: 'inspect_embeds', error: 'Tool call was aborted.' }
			}
			const parsed = InspectEmbedsInput.safeParse(input ?? {})
			if (!parsed.success) return invalidArgumentsResult('inspect_embeds', parsed.error)
			try {
				return { ok: true, tool: 'inspect_embeds', ...inspectEmbeds(agent.editor, parsed.data) }
			} catch (error) {
				return toolErrorResult('inspect_embeds', error)
			}
		},
		readOnly: true,
		untrustedContent: true,
	})

	catalog.set('zoom_out', {
		name: 'zoom_out',
		purpose: CAMERA_PURPOSES.zoom_out,
		inputSchema: ZOOM_OUT_INPUT_SCHEMA,
		execute: (input, context) => {
			if (context?.signal?.aborted) {
				return { ok: false, tool: 'zoom_out', error: 'Tool call was aborted.' }
			}
			const parsed = ZoomOutInput.safeParse(input ?? {})
			if (!parsed.success) return invalidArgumentsResult('zoom_out', parsed.error)
			try {
				return { ok: true, tool: 'zoom_out', ...zoomOutCanvas(agent.editor, parsed.data) }
			} catch (error) {
				return toolErrorResult('zoom_out', error)
			}
		},
		readOnly: false,
		untrustedContent: false,
	})

	catalog.set('arrange_grid', {
		name: 'arrange_grid',
		purpose: GRID_PURPOSES.arrange_grid,
		inputSchema: ARRANGE_GRID_INPUT_SCHEMA,
		execute: (input, context) => {
			if (context?.signal?.aborted) {
				return { ok: false, tool: 'arrange_grid', error: 'Tool call was aborted.' }
			}
			const parsed = ArrangeGridInput.safeParse(input)
			if (!parsed.success) return invalidArgumentsResult('arrange_grid', parsed.error)
			try {
				return { ok: true, tool: 'arrange_grid', ...arrangeGrid(agent.editor, parsed.data) }
			} catch (error) {
				return toolErrorResult('arrange_grid', error)
			}
		},
		readOnly: false,
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
