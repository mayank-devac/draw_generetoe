import { useEffect, useMemo, useState } from 'react'
import { isRecordsDiffEmpty, useValue } from 'tldraw'
import { getAgentModelDefinition } from '../../shared/models'
import { ChatHistoryActionItem } from '../../shared/types/ChatHistoryItem'
import { AgentAction } from '../../shared/types/AgentAction'
import { Streaming } from '../../shared/types/Streaming'
import { TldrawAgent } from '../agent/TldrawAgent'
import { ChevronDownIcon } from './icons/ChevronDownIcon'
import { getActionInfo } from './chat-history/getActionInfo'
import { isHtmlLiveOutput } from '../lib/agentLiveOutput'

export function AgentActivityState({
	agent,
	actions,
}: {
	agent: TldrawAgent
	actions: ChatHistoryActionItem[]
}) {
	const [expanded, setExpanded] = useState(true)
	const elapsed = useElapsed()
	const streamingJson = useValue(agent.$streamingJson)
	const activeRequest = useValue(agent.$activeRequest)
	const latestAction = actions.at(-1)?.action
	const completedCount = actions.filter((item) => item.action.complete).length
	const canvasChangeCount = actions.filter(
		(item) => item.action.complete && !isRecordsDiffEmpty(item.diff)
	).length

	const modelDescription = activeRequest
		? getAgentModelDefinition(activeRequest.modelName).displayName
		: 'AI model'
	const thinkingDescription = activeRequest?.thinkingLevel
		? ` · ${capitalize(activeRequest.thinkingLevel)}`
		: ''

	const htmlStream = isHtmlLiveOutput(streamingJson, latestAction?._type)
	const status = getActivityStatus(latestAction, Boolean(streamingJson), htmlStream)
	const actionRows = useMemo(
		() =>
			actions
				.map((item) => ({
					complete: item.action.complete,
					text: getActivityDescription(item.action, agent),
				}))
				.filter((row) => row.text)
				.slice(-4),
		[actions, agent]
	)

	return (
		<div className="agent-activity-state" role="status" aria-live="polite">
			<button
				type="button"
				className="agent-activity-header"
				aria-expanded={expanded}
				onClick={() => setExpanded((value) => !value)}
			>
				<span className="agent-activity-spark" aria-hidden="true">
					✦
				</span>
				<span className="agent-activity-label">{status}</span>
				<span className="agent-activity-elapsed">{elapsed}</span>
				<span className={`agent-activity-chevron${expanded ? ' is-expanded' : ''}`}>
					<ChevronDownIcon />
				</span>
			</button>

			<div className={`agent-activity-details${expanded ? ' is-expanded' : ''}`}>
				<div className="agent-activity-details-inner">
					<div className="agent-activity-trace">
						<ActivityRow
							complete
							text={`${modelDescription}${thinkingDescription}`}
							secondary="Request sent"
						/>
						{!streamingJson && !latestAction ? (
							<ActivityRow complete={false} text="Waiting for the model response" />
						) : (
							<ActivityRow
								complete={Boolean(latestAction)}
								text={htmlStream ? 'Receiving HTML' : 'Receiving response'}
								secondary={
									streamingJson
										? `${formatCharacterCount(streamingJson.length)} received`
										: undefined
								}
							/>
						)}
						{actionRows.map((row, index) => (
							<ActivityRow
								key={`${index}-${row.text}`}
								complete={row.complete}
								text={row.text}
							/>
						))}
						{completedCount > 0 && (
							<div className="agent-activity-count">
								{canvasChangeCount > 0
									? `${canvasChangeCount} canvas ${canvasChangeCount === 1 ? 'change' : 'changes'} applied`
									: `${completedCount} ${completedCount === 1 ? 'step' : 'steps'} completed`}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

function ActivityRow({
	complete,
	text,
	secondary,
}: {
	complete: boolean
	text: string
	secondary?: string
}) {
	return (
		<div className="agent-activity-row">
			{complete ? (
				<span className="agent-activity-check" aria-hidden="true">
					✓
				</span>
			) : (
				<span className="agent-activity-spinner" aria-hidden="true" />
			)}
			<span className="agent-activity-row-text">{text}</span>
			{secondary && <span className="agent-activity-secondary">{secondary}</span>}
		</div>
	)
}

function getActivityStatus(
	action: Streaming<AgentAction> | undefined,
	hasJson: boolean,
	htmlStream: boolean
) {
	if (!hasJson && !action) return 'Thinking'
	if (htmlStream && (!action || action._type === 'createHtmlPreview')) {
		return action?.complete ? 'Created HTML preview' : 'Building HTML preview'
	}
	if (!action) return 'Streaming response'

	switch (action._type) {
		case 'think':
			return 'Planning the drawing'
		case 'pen':
		case 'create':
			return 'Drawing on canvas'
		case 'createHtmlPreview':
			return action.complete ? 'Created HTML preview' : 'Building HTML preview'
		case 'review':
			return 'Reviewing the result'
		case 'message':
			return 'Finishing response'
		default:
			return 'Applying canvas actions'
	}
}

function getActivityDescription(action: Streaming<AgentAction>, agent: TldrawAgent) {
	if (action._type === 'update-todo-list') return action.text ?? 'Updating the plan'
	const description = getActionInfo(action, agent).description
	if (description) return cleanMarkdown(description)
	if ('intent' in action && typeof action.intent === 'string') return action.intent
	return action.complete ? `Completed ${action._type}` : `Running ${action._type}`
}

function cleanMarkdown(value: string) {
	return value.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
}

function capitalize(value: string) {
	return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatCharacterCount(length: number) {
	if (length < 1000) return `${length} characters`
	return `${(length / 1000).toFixed(1)}k characters`
}

function useElapsed() {
	const [deciseconds, setDeciseconds] = useState(0)

	useEffect(() => {
		const timer = window.setInterval(() => setDeciseconds((value) => value + 1), 100)
		return () => window.clearInterval(timer)
	}, [])

	const seconds = deciseconds / 10
	if (seconds < 60) return `${seconds.toFixed(1)}s`
	return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s`
}
