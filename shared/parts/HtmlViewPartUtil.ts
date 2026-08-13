import { AgentRequest } from '../types/AgentRequest'
import { BasePromptPart } from '../types/BasePromptPart'
import { PromptPartUtil } from './PromptPartUtil'

export interface HtmlViewPart extends BasePromptPart<'htmlView'> {
	requested: boolean
}

export class HtmlViewPartUtil extends PromptPartUtil<HtmlViewPart> {
	static override type = 'htmlView' as const

	override getPriority() {
		return -180
	}

	override getPart(request: AgentRequest): HtmlViewPart {
		return {
			type: 'htmlView',
			requested: request.preferHtmlPreview === true,
		}
	}

	override buildContent({ requested }: HtmlViewPart) {
		if (!requested) return []

		return [
			'The user selected HTML view. You MUST call createHtmlPreview. Make a visual playground: animation, diagram, or interactive toy. Almost no text — short labels only. Teach by showing what happens when they drag, click, or slide. Inline CSS/JS only.',
		]
	}
}
