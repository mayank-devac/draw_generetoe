import { AgentLiveCodeBlock } from './AgentLiveCodeBlock'
import { AgentLiveLanguage, getAgentLivePreview } from '../lib/agentLiveOutput'

export function AgentLiveOutput({
	json,
	isStreaming,
	preferLanguage,
}: {
	json: string
	isStreaming: boolean
	preferLanguage?: AgentLiveLanguage
}) {
	const preview = getAgentLivePreview(json)

	if (preview) {
		return (
			<AgentLiveCodeBlock
				language={preview.language}
				filename={preview.filename}
				code={preview.code}
				isStreaming={isStreaming}
			/>
		)
	}

	if (isStreaming && preferLanguage) {
		return (
			<AgentLiveCodeBlock
				language={preferLanguage}
				filename={preferLanguage === 'html' ? 'preview.html' : `output.${preferLanguage}`}
				code=""
				isStreaming
			/>
		)
	}

	return null
}
