import type { AgentAction } from '../../shared/types/AgentAction'

export const ACTION_TOOL_NAMES = [
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

export const COMMONS_TOOL_NAMES = ['search_commons_images', 'add_commons_image'] as const
export const MERMAID_TOOL_NAMES = ['create_mermaid_diagram'] as const
export const PAGE_TOOL_NAMES = ['create_page', 'inspect_pages'] as const
export const EMBED_TOOL_NAMES = ['inspect_embeds'] as const
export const CAMERA_TOOL_NAMES = ['zoom_out'] as const
export const GRID_TOOL_NAMES = ['arrange_grid'] as const
export const DISCOVERY_TOOL_NAMES = ['list_tools', 'describe_tools'] as const
export const ALL_TOOL_NAMES = [
	...ACTION_TOOL_NAMES,
	...COMMONS_TOOL_NAMES,
	...MERMAID_TOOL_NAMES,
	...PAGE_TOOL_NAMES,
	...EMBED_TOOL_NAMES,
	...CAMERA_TOOL_NAMES,
	...GRID_TOOL_NAMES,
	...DISCOVERY_TOOL_NAMES,
] as const

export type ActionToolName = (typeof ACTION_TOOL_NAMES)[number]
export type CommonsToolName = (typeof COMMONS_TOOL_NAMES)[number]
export type MermaidToolName = (typeof MERMAID_TOOL_NAMES)[number]
export type PageToolName = (typeof PAGE_TOOL_NAMES)[number]
export type EmbedToolName = (typeof EMBED_TOOL_NAMES)[number]
export type CameraToolName = (typeof CAMERA_TOOL_NAMES)[number]
export type GridToolName = (typeof GRID_TOOL_NAMES)[number]
export type ToolName = (typeof ALL_TOOL_NAMES)[number]

export const DESTRUCTIVE_ACTION_TOOL_NAMES = new Set<ActionToolName>(['delete', 'clear'])
export const UNTRUSTED_ACTION_TOOL_NAMES = new Set<ActionToolName>(['getInspiration'])
