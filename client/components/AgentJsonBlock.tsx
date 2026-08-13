import { AgentLiveCodeBlock } from './AgentLiveCodeBlock'

/** @deprecated Use AgentLiveCodeBlock or AgentLiveOutput. Kept for existing imports. */
export function AgentJsonBlock({ json, isStreaming }: { json: string; isStreaming: boolean }) {
	return (
		<AgentLiveCodeBlock
			language="json"
			filename="agent-output.json"
			code={json}
			isStreaming={isStreaming}
		/>
	)
}
