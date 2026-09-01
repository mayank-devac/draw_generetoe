import { z } from 'zod'
import { ALL_TOOL_NAMES } from '../toolNames'
import type { JsonSchema } from '../jsonSchema'

export const SEARCH_COMMONS_IMAGES_INPUT_SCHEMA: JsonSchema = Object.freeze({
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

export const ADD_COMMONS_IMAGE_INPUT_SCHEMA: JsonSchema = Object.freeze({
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

export const CREATE_MERMAID_DIAGRAM_INPUT_SCHEMA: JsonSchema = Object.freeze({
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

export const CREATE_PAGE_INPUT_SCHEMA: JsonSchema = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: Object.freeze({}),
})

export const INSPECT_PAGES_INPUT_SCHEMA: JsonSchema = Object.freeze({
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

export const INSPECT_EMBEDS_INPUT_SCHEMA: JsonSchema = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: Object.freeze({
		pageNumber: Object.freeze({
			type: 'integer',
			minimum: 1,
			description: 'Optional 1-based page number. Defaults to the current page.',
		}),
		shapeId: Object.freeze({
			type: 'string',
			minLength: 1,
			maxLength: 128,
			description: 'Optional simple ID of one embed shape on that page.',
		}),
	}),
})

export const ZOOM_OUT_INPUT_SCHEMA: JsonSchema = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: Object.freeze({
		steps: Object.freeze({
			type: 'integer',
			minimum: 1,
			maximum: 50,
			description:
				'Optional number of navigation-panel zoom-out increments. Omit to fit all shapes in the viewport.',
		}),
	}),
})

export const ARRANGE_GRID_INPUT_SCHEMA: JsonSchema = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: Object.freeze(['shapeIds']),
	properties: Object.freeze({
		shapeIds: Object.freeze({
			type: 'array',
			minItems: 2,
			maxItems: 100,
			uniqueItems: true,
			description: 'Unique simple IDs of top-level resizable shapes on the current page.',
			items: Object.freeze({ type: 'string', minLength: 1, maxLength: 128 }),
		}),
		columns: Object.freeze({
			type: 'integer',
			minimum: 1,
			maximum: 20,
			description: 'Optional column count. Default ceil(sqrt(shape count)).',
		}),
		gap: Object.freeze({
			type: 'number',
			minimum: 0,
			maximum: 500,
			description: 'Optional horizontal and vertical gap. Default 50.',
		}),
		targetWidth: Object.freeze({
			type: 'number',
			minimum: 64,
			maximum: 2000,
			description: 'Optional starting common width. Default 600; may grow for provider minimums.',
		}),
		fitCamera: Object.freeze({
			type: 'boolean',
			description: 'Whether to fit the arranged grid in the viewport. Default true.',
		}),
	}),
}) as JsonSchema

export const LIST_TOOLS_INPUT_SCHEMA: JsonSchema = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: Object.freeze({}),
})

export const DESCRIBE_TOOLS_INPUT_SCHEMA: JsonSchema = Object.freeze({
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

export const DescribeToolsInput = z.object({
	names: z
		.array(z.enum(ALL_TOOL_NAMES))
		.min(1)
		.max(10)
		.refine((names) => new Set(names).size === names.length, 'Tool names must be unique.'),
})

export const SearchCommonsImagesInput = z
	.object({
		query: z.string().trim().min(2).max(80),
	})
	.strict()

export const AddCommonsImageInput = z
	.object({
		pageId: z.number().int().positive(),
		x: z.number().finite(),
		y: z.number().finite(),
		maxWidth: z.number().finite().min(64).max(1600).optional(),
		maxHeight: z.number().finite().min(64).max(1200).optional(),
	})
	.strict()

export const CreateMermaidDiagramInput = z
	.object({
		shapeId: z.string().trim().min(1).max(100),
		source: z.string().trim().min(1).max(50000),
		title: z.string().trim().min(1).max(120).optional(),
		w: z.number().finite().min(320).max(1600).optional(),
		h: z.number().finite().min(240).max(1200).optional(),
	})
	.strict()

export const CreatePageInput = z.object({}).strict()

export const InspectPagesInput = z
	.object({
		pageNumber: z.number().int().positive().optional(),
	})
	.strict()

export const InspectEmbedsInput = z
	.object({
		pageNumber: z.number().int().positive().optional(),
		shapeId: z.string().trim().min(1).max(128).optional(),
	})
	.strict()

export const ZoomOutInput = z
	.object({
		steps: z.number().int().min(1).max(50).optional(),
	})
	.strict()

export const ArrangeGridInput = z
	.object({
		shapeIds: z
			.array(z.string().trim().min(1).max(128))
			.min(2)
			.max(100)
			.refine((shapeIds) => new Set(shapeIds).size === shapeIds.length, 'Shape IDs must be unique.'),
		columns: z.number().int().min(1).max(20).optional(),
		gap: z.number().finite().min(0).max(500).optional(),
		targetWidth: z.number().finite().min(64).max(2000).optional(),
		fitCamera: z.boolean().optional(),
	})
	.strict()
