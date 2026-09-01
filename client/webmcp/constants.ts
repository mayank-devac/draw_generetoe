import type { JsonSchema } from './jsonSchema'
import type {
	ActionToolName,
	CameraToolName,
	CommonsToolName,
	EmbedToolName,
	GridToolName,
	MermaidToolName,
	PageToolName,
} from './toolNames'

export {
	ACTION_TOOL_NAMES,
	ALL_TOOL_NAMES,
	CAMERA_TOOL_NAMES,
	COMMONS_TOOL_NAMES,
	DESTRUCTIVE_ACTION_TOOL_NAMES,
	DISCOVERY_TOOL_NAMES,
	EMBED_TOOL_NAMES,
	GRID_TOOL_NAMES,
	MERMAID_TOOL_NAMES,
	PAGE_TOOL_NAMES,
	UNTRUSTED_ACTION_TOOL_NAMES,
} from './toolNames'

export type {
	ActionToolName,
	CameraToolName,
	CommonsToolName,
	EmbedToolName,
	GridToolName,
	MermaidToolName,
	PageToolName,
	ToolName,
} from './toolNames'

export const ACTION_PURPOSES: Record<ActionToolName, string> = {
	review: 'Review a canvas region and schedule a follow-up turn when more work may be needed.',
	create: 'Create one new canvas shape from the app\'s existing simple-shape format.',
	createHtmlPreview: 'Create a visible interactive HTML preview shape in the current canvas view.',
	delete:
		'Delete one existing canvas shape by its simple shape ID. WebMCP requires confirm: true after user approval.',
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
	stack: 'Pack existing shapes along the horizontal or vertical axis with a requested gap, without aligning them.',
	clear:
		'Delete all shapes on the current page, leaving other pages unchanged. WebMCP requires confirm: true after user approval.',
	pen: 'Draw a visible freehand or straight-point path, optionally closed and filled.',
	getInspiration: 'Fetch a random Wikipedia article and schedule it as inspiration for a follow-up turn.',
	count: 'Count the current page shapes and schedule the answer for a follow-up turn.',
}

export const COMMONS_PURPOSES: Record<CommonsToolName, string> = {
	search_commons_images:
		'Search Wikimedia Commons for up to six verified CC0 or public-domain images before choosing one to add.',
	add_commons_image:
		'Re-verify and add one Commons image at exact canvas coordinates with a grouped visible credit.',
}

export const MERMAID_PURPOSES: Record<MermaidToolName, string> = {
	create_mermaid_diagram:
		'Render Mermaid source in the top preview panel so the user can inspect or edit it and choose whether to add it to the canvas. Follow the new-drawing page workflow first.',
}

export const NEW_DRAW_PAGE_WORKFLOW =
	'Before starting a new drawing, call inspect_pages. If the current page contains objects, call create_page and draw on the new page. If it is empty, reuse the current page.'

export const PAGE_PURPOSES: Record<PageToolName, string> = {
	create_page: `Create and switch to a new automatically named canvas page. ${NEW_DRAW_PAGE_WORKFLOW}`,
	inspect_pages: `List current and all canvas pages with object counts, or inspect object IDs and types for one 1-based page number. ${NEW_DRAW_PAGE_WORKFLOW}`,
}

export const EMBED_PURPOSES: Record<EmbedToolName, string> = {
	inspect_embeds:
		'Return source URLs of tldraw embed shapes on a canvas page (YouTube, Figma, and other Insert-embed providers) so the agent can research the inserted content into canvas.',
}

export const CAMERA_PURPOSES: Record<CameraToolName, string> = {
	zoom_out:
		'Zoom the current page camera so more of the canvas is visible. With no arguments, fit all shapes in the viewport. With steps, zoom out that many navigation-panel increments.',
}

export const GRID_PURPOSES: Record<GridToolName, string> = {
	arrange_grid:
		'Normalize rotation and size for selected top-level shapes, arrange them in a row-major grid, and optionally fit the camera. Automatically adapts to aspect locks and provider minimum sizes.',
}

export const PARAMETER_DESCRIPTIONS: Record<ActionToolName, Record<string, string>> = {
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

export const HOST_INPUT_STUB: JsonSchema = Object.freeze({
	type: 'object',
	description: 'Full args: describe_tools({names}).',
	additionalProperties: true,
	properties: Object.freeze({}),
})
