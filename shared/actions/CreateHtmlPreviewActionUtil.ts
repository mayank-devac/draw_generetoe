import { createShapeId } from 'tldraw'
import z from 'zod'
import { AgentHelpers } from '../AgentHelpers'
import { HTML_PREVIEW_SHAPE_TYPE, stripHtmlCodeFences } from '../format/htmlPreview'
import { Streaming } from '../types/Streaming'
import { AgentActionUtil } from './AgentActionUtil'

const CreateHtmlPreviewAction = z
	.object({
		_type: z.literal('createHtmlPreview'),
		intent: z.string(),
		shapeId: z.string(),
		title: z.string(),
		html: z.string(),
		w: z.number().optional(),
		h: z.number().optional(),
	})
	.meta({
		title: 'Create HTML preview',
		description:
			'Create a visual, interactive HTML preview centered in the current view. Use when the idea needs simulation, motion, or controls (sliders, buttons, drag). Teach by showing, not by writing. Self-contained HTML with inline CSS/JS only.',
	})

type CreateHtmlPreviewAction = z.infer<typeof CreateHtmlPreviewAction>

export class CreateHtmlPreviewActionUtil extends AgentActionUtil<CreateHtmlPreviewAction> {
	static override type = 'createHtmlPreview' as const

	override getSchema() {
		return CreateHtmlPreviewAction
	}

	override getInfo(action: Streaming<CreateHtmlPreviewAction>) {
		const title = action.title?.trim()
		const description = action.complete
			? `Created HTML view${title ? `: ${title}` : ''}`
			: 'Creating HTML view'
		return {
			icon: 'window' as const,
			description: action.intent ? `${description} — ${action.intent}` : description,
			canGroup: () => false,
		}
	}

	override sanitizeAction(action: Streaming<CreateHtmlPreviewAction>, helpers: AgentHelpers) {
		if (!action.complete) return action
		action.shapeId = helpers.ensureShapeIdIsUnique(action.shapeId || 'html-preview')
		return action
	}

	override applyAction(action: Streaming<CreateHtmlPreviewAction>, _helpers: AgentHelpers) {
		if (!action.complete) return
		if (!this.agent) return

		const { editor } = this.agent
		const viewport = editor.getViewportPageBounds()
		const size = getHtmlPreviewSize(viewport, action.w, action.h)
		const title = action.title.trim() || 'HTML view'

		editor.createShape({
			id: createShapeId(action.shapeId),
			type: HTML_PREVIEW_SHAPE_TYPE,
			x: viewport.x + (viewport.w - size.w) / 2,
			y: viewport.y + (viewport.h - size.h) / 2,
			props: {
				w: size.w,
				h: size.h,
				html: stripHtmlCodeFences(action.html),
				title,
				thumbnail: '',
			},
			meta: {
				note: `HTML preview: ${title}`,
			},
		})
	}

	override buildSystemPrompt() {
		return `

## HTML preview boxes

Use \`createHtmlPreview\` to put a visual playground on the canvas (centered in view). Teach by seeing and doing, not by reading.

Use it when the idea needs motion, simulation, or controls (sliders, buttons, drag). Skip it for ordinary diagrams that canvas shapes can draw.

Visual-learning rules for the HTML:
- Show the concept as a picture, animation, or toy the user can play with. Almost no paragraphs.
- At most a 2–5 word title and tiny labels on controls. No essays, bullet lists, or step-by-step text.
- Meaning should come from color, size, motion, layout, and what happens when the user interacts.
- One idea per preview. Big visuals, generous empty space, obvious controls.
- Self-contained HTML with inline CSS/JS only. No external files.
- After creating it, send a very short \`message\` (one line). The user presses Play on the box to interact.
`
	}
}

function getHtmlPreviewSize(
	viewport: { w: number; h: number },
	requestedW?: number,
	requestedH?: number
) {
	const padding = Math.min(viewport.w, viewport.h) * 0.1
	const maxW = Math.max(360, Math.min(viewport.w - padding * 2, 900))
	const maxH = Math.max(280, Math.min(viewport.h - padding * 2, 700))
	const w = requestedW && requestedW > 0 ? Math.min(Math.max(requestedW, 280), maxW) : maxW
	const h = requestedH && requestedH > 0 ? Math.min(Math.max(requestedH, 220), maxH) : maxH
	return { w, h }
}
