import z from 'zod'
import { zoomOutCanvas } from '../zoomOutCanvas'
import { Streaming } from '../types/Streaming'
import { AgentActionUtil } from './AgentActionUtil'

const ZoomOutAction = z
	.object({
		_type: z.literal('zoom_out'),
		steps: z.number().int().min(1).max(50).optional(),
	})
	.meta({
		title: 'Zoom out',
		description:
			'Zoom the current page camera so more of the canvas is visible. Omit steps to fit all shapes in the viewport. Pass steps to zoom out that many navigation-panel increments.',
	})

type ZoomOutAction = z.infer<typeof ZoomOutAction>

export class ZoomOutActionUtil extends AgentActionUtil<ZoomOutAction> {
	static override type = 'zoom_out' as const

	override getSchema() {
		return ZoomOutAction
	}

	override getInfo(action: Streaming<ZoomOutAction>) {
		if (!action.complete) {
			return { icon: 'eye' as const, description: 'Zooming out' }
		}
		const description =
			action.steps === undefined ? 'Zoomed to fit all shapes' : `Zoomed out ${action.steps} steps`
		return { icon: 'eye' as const, description }
	}

	override applyAction(action: Streaming<ZoomOutAction>) {
		if (!action.complete) return
		if (!this.agent) return

		zoomOutCanvas(this.agent.editor, { steps: action.steps })
	}
}
