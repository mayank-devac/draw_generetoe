import { useCallback, useMemo } from 'react'
import { RecordsDiff, reverseRecordsDiff, squashRecordDiffs, TLRecord, useValue } from 'tldraw'
import { HTML_PREVIEW_SHAPE_TYPE } from '../../../shared/format/htmlPreview'
import { ChatHistoryActionItem } from '../../../shared/types/ChatHistoryItem'
import { TldrawAgent } from '../../agent/TldrawAgent'
import { AgentIcon, AgentIconType } from '../icons/AgentIcon'
import { ChatHistoryGroup } from './ChatHistoryGroup'
import { TldrawDiffViewer } from './TldrawDiffViewer'
import { getActionInfo } from './getActionInfo'

export function ChatHistoryGroupWithDiff({
	group,
	agent,
}: {
	group: ChatHistoryGroup
	agent: TldrawAgent
}) {
	const { items } = group
	const { editor } = agent
	const diff = useMemo(() => squashRecordDiffs(items.map((item) => item.diff)), [items])

	// Accept all changes from this group
	const handleAccept = useCallback(() => {
		agent.$chatHistory.update((currentChatHistoryItems) => {
			const newItems = [...currentChatHistoryItems]
			for (const item of items) {
				const index = newItems.findIndex((v) => v === item)

				// Mark the item as accepted
				if (index !== -1) {
					newItems[index] = { ...item, acceptance: 'accepted' }
				}

				// Apply the diff if needed
				if (item.acceptance === 'rejected') {
					editor.store.applyDiff(item.diff)
				}
			}
			return newItems
		})
	}, [items, editor, agent.$chatHistory])

	// Reject all changes from this group
	const handleReject = useCallback(() => {
		agent.$chatHistory.update((currentChatHistoryItems) => {
			const newItems = [...currentChatHistoryItems]
			for (const item of items) {
				const index = newItems.findIndex((v) => v === item)

				// Mark the item as rejected
				if (index !== -1) {
					newItems[index] = { ...item, acceptance: 'rejected' }
				}

				// Reverse the diff if needed
				if (item.acceptance !== 'rejected') {
					const reverseDiff = reverseRecordsDiff(item.diff)
					editor.store.applyDiff(reverseDiff)
				}
			}
			return newItems
		})
	}, [items, editor, agent.$chatHistory])

	// Get the acceptance status of the group
	// If all items are accepted, the group is accepted
	// If all items are rejected, the group is rejected
	// Otherwise, the group is pending
	const acceptance = useMemo<ChatHistoryActionItem['acceptance']>(() => {
		if (items.length === 0) return 'pending'
		const acceptance = items[0].acceptance
		for (let i = 1; i < items.length; i++) {
			if (items[i].acceptance !== acceptance) {
				return 'pending'
			}
		}
		return acceptance
	}, [items])

	const steps = useMemo(
		() => items.map((item) => getActionInfo(item.action, agent)),
		[items, agent]
	)

	return (
		<div className="chat-history-change">
			<div className="chat-history-change-acceptance">
				<button onClick={handleReject} disabled={acceptance === 'rejected'}>
					{acceptance === 'rejected' ? 'Rejected' : 'Reject'}
				</button>
				<button onClick={handleAccept} disabled={acceptance === 'accepted'}>
					{acceptance === 'accepted' ? 'Accepted' : 'Accept'}
				</button>
			</div>
			<DiffSteps steps={steps} />
			<ChatDiffPreview diff={diff} agent={agent} />
		</div>
	)
}

function ChatDiffPreview({
	diff,
	agent,
}: {
	diff: RecordsDiff<TLRecord>
	agent: TldrawAgent
}) {
	const { htmlPreviews, hasOtherShapes } = useValue(
		'html-preview chat thumbs',
		() => partitionDiffShapes(diff, agent.editor),
		[diff, agent]
	)

	return (
		<>
			{htmlPreviews.map((preview) => (
				<div className="html-preview-history-card" key={preview.id}>
					<div className="html-preview-chrome">
						<span className="html-preview-dot" aria-hidden="true" />
						<span className="html-preview-title">{preview.title}</span>
					</div>
					{preview.thumbnail ? (
						<img
							className="html-preview-history-shot"
							src={preview.thumbnail}
							alt={`${preview.title} paused preview`}
						/>
					) : (
						<div className="html-preview-placeholder">Paused preview</div>
					)}
				</div>
			))}
			{hasOtherShapes && <TldrawDiffViewer diff={diff} />}
		</>
	)
}

function partitionDiffShapes(diff: RecordsDiff<TLRecord>, editor: TldrawAgent['editor']) {
	const records: TLRecord[] = [
		...Object.values(diff.added),
		...Object.values(diff.updated).map(([, after]) => after),
		...Object.values(diff.removed),
	]
	const htmlPreviews: { id: string; title: string; thumbnail: string }[] = []
	let hasOtherShapes = false

	for (const record of records) {
		if (record.typeName !== 'shape') continue
		if (record.type === HTML_PREVIEW_SHAPE_TYPE) {
			const live = editor.getShape(record.id)
			const props =
				live && live.type === HTML_PREVIEW_SHAPE_TYPE ? live.props : record.props
			const title = 'title' in props && typeof props.title === 'string' && props.title.trim()
				? props.title
				: 'HTML view'
			const thumbnail =
				'thumbnail' in props && typeof props.thumbnail === 'string' ? props.thumbnail : ''
			htmlPreviews.push({ id: record.id, title, thumbnail })
		} else {
			hasOtherShapes = true
		}
	}

	return { htmlPreviews, hasOtherShapes }
}

interface DiffStep {
	icon: AgentIconType | null
	description: string | null
}

function DiffSteps({ steps }: { steps: DiffStep[] }) {
	let previousDescription = ''
	return (
		<div className="agent-changes">
			{steps.map((step, i) => {
				if (!step.description) return null

				if (step.description === previousDescription) return null
				previousDescription = step.description
				return (
					<div className="agent-change" key={'intent-' + i}>
						{step.icon && (
							<span className="agent-change-icon">
								<AgentIcon type={step.icon} />
							</span>
						)}
						{step.description}
					</div>
				)
			})}
		</div>
	)
}
