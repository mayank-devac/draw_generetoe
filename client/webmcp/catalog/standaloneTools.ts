import { zoomOutCanvas } from '../../../shared/zoomOutCanvas'
import { TldrawAgent } from '../../agent/TldrawAgent'
import { searchCommonsImages } from '../../commons/commonsImages'
import { insertCommonsImage } from '../../commons/insertCommonsImage'
import { previewMermaidDiagram } from '../../mermaid/mermaidDiagram'
import {
	CAMERA_PURPOSES,
	COMMONS_PURPOSES,
	EMBED_PURPOSES,
	GRID_PURPOSES,
	MERMAID_PURPOSES,
	PAGE_PURPOSES,
	type ToolName,
} from '../constants'
import { inspectEmbeds } from '../embedTools'
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
	INSPECT_EMBEDS_INPUT_SCHEMA,
	INSPECT_PAGES_INPUT_SCHEMA,
	InspectEmbedsInput,
	InspectPagesInput,
	SEARCH_COMMONS_IMAGES_INPUT_SCHEMA,
	SearchCommonsImagesInput,
	ZOOM_OUT_INPUT_SCHEMA,
	ZoomOutInput,
} from '../schemas/standaloneSchemas'
import type { CatalogEntry } from '../types'
import { defineCatalogTool } from './defineCatalogTool'

export function registerStandaloneTools(agent: TldrawAgent, catalog: Map<ToolName, CatalogEntry>) {
	const tools: CatalogEntry[] = [
		defineCatalogTool(agent, {
			name: 'search_commons_images',
			purpose: COMMONS_PURPOSES.search_commons_images,
			inputSchema: SEARCH_COMMONS_IMAGES_INPUT_SCHEMA,
			parser: SearchCommonsImagesInput,
			run: async (data, ctx) => {
				const images = await searchCommonsImages(data.query, ctx.signal)
				return { query: data.query, count: images.length, images }
			},
			readOnly: true,
			untrustedContent: true,
		}),
		defineCatalogTool(agent, {
			name: 'add_commons_image',
			purpose: COMMONS_PURPOSES.add_commons_image,
			inputSchema: ADD_COMMONS_IMAGE_INPUT_SCHEMA,
			parser: AddCommonsImageInput,
			run: async (data, ctx) => insertCommonsImage(ctx.agent.editor, data, ctx.signal),
			readOnly: false,
			untrustedContent: true,
		}),
		defineCatalogTool(agent, {
			name: 'create_mermaid_diagram',
			purpose: MERMAID_PURPOSES.create_mermaid_diagram,
			inputSchema: CREATE_MERMAID_DIAGRAM_INPUT_SCHEMA,
			parser: CreateMermaidDiagramInput,
			run: async (data, ctx) => previewMermaidDiagram(ctx.agent.editor, data, ctx.signal),
			readOnly: false,
			checkAbort: true,
			catchAbort: true,
		}),
		defineCatalogTool(agent, {
			name: 'create_page',
			purpose: PAGE_PURPOSES.create_page,
			inputSchema: CREATE_PAGE_INPUT_SCHEMA,
			parser: CreatePageInput,
			run: (_data, ctx) => createCanvasPage(ctx.agent.editor),
			readOnly: false,
			checkAbort: true,
			defaultEmptyInput: true,
		}),
		defineCatalogTool(agent, {
			name: 'inspect_pages',
			purpose: PAGE_PURPOSES.inspect_pages,
			inputSchema: INSPECT_PAGES_INPUT_SCHEMA,
			parser: InspectPagesInput,
			beforeRun: (data, ctx) => {
				const totalPages = ctx.agent.editor.getPages().length
				if (data.pageNumber !== undefined && data.pageNumber > totalPages) {
					return {
						ok: false,
						tool: 'inspect_pages',
						error: `Page number ${data.pageNumber} does not exist.`,
						totalPages,
					}
				}
				return null
			},
			run: (data, ctx) => inspectCanvasPages(ctx.agent.editor, data.pageNumber),
			readOnly: true,
			checkAbort: true,
			defaultEmptyInput: true,
		}),
		defineCatalogTool(agent, {
			name: 'inspect_embeds',
			purpose: EMBED_PURPOSES.inspect_embeds,
			inputSchema: INSPECT_EMBEDS_INPUT_SCHEMA,
			parser: InspectEmbedsInput,
			run: (data, ctx) => inspectEmbeds(ctx.agent.editor, data),
			readOnly: true,
			untrustedContent: true,
			checkAbort: true,
			defaultEmptyInput: true,
		}),
		defineCatalogTool(agent, {
			name: 'zoom_out',
			purpose: CAMERA_PURPOSES.zoom_out,
			inputSchema: ZOOM_OUT_INPUT_SCHEMA,
			parser: ZoomOutInput,
			run: (data, ctx) => zoomOutCanvas(ctx.agent.editor, data),
			readOnly: false,
			checkAbort: true,
			defaultEmptyInput: true,
		}),
		defineCatalogTool(agent, {
			name: 'arrange_grid',
			purpose: GRID_PURPOSES.arrange_grid,
			inputSchema: ARRANGE_GRID_INPUT_SCHEMA,
			parser: ArrangeGridInput,
			run: (data, ctx) => arrangeGrid(ctx.agent.editor, data),
			readOnly: false,
			checkAbort: true,
		}),
	]

	for (const tool of tools) {
		catalog.set(tool.name, tool)
	}
}
