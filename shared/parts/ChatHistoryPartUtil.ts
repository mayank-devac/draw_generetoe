import { AgentHelpers } from '../AgentHelpers'
import { AgentMessage, AgentMessageContent } from '../types/AgentMessage'
import { AgentRequest } from '../types/AgentRequest'
import { BasePromptPart } from '../types/BasePromptPart'
import { ChatHistoryItem } from '../types/ChatHistoryItem'
import { PromptPartUtil } from './PromptPartUtil'

export interface ChatHistoryPart extends BasePromptPart<'chatHistory'> {
	items: ChatHistoryItem[] | null
}

const HISTORY_COMPACTION_THRESHOLD_TOKENS = 10_000
const RECENT_HISTORY_TOKEN_BUDGET = 7_000
const SUMMARY_CHARACTER_BUDGET = 8_000

export class ChatHistoryPartUtil extends PromptPartUtil<ChatHistoryPart> {
	static override type = 'chatHistory' as const

	override getPriority() {
		return Infinity // history should appear first in the prompt (low priority)
	}

	override async getPart(_request: AgentRequest, helpers: AgentHelpers) {
		if (!this.agent) return { type: 'chatHistory' as const, items: null }

		// Transform a clone so repeated requests never shift persisted context coordinates.
		const items = structuredClone(this.agent.$chatHistory.get())

		for (const historyItem of items) {
			if (historyItem.type !== 'prompt') continue

			// Offset and round the context items of each history item
			const contextItems = historyItem.contextItems.map((contextItem) => {
				const offsetContextItem = helpers.applyOffsetToContextItem(contextItem)
				return helpers.roundContextItem(offsetContextItem)
			})

			historyItem.contextItems = contextItems
		}

		return {
			type: 'chatHistory' as const,
			items,
		}
	}

	override buildMessages({ items }: ChatHistoryPart): AgentMessage[] {
		if (!items) return []

		const messages: AgentMessage[] = []
		const priority = this.getPriority()

		// If the last message is from the user, skip it
		const lastIndex = items.length - 1
		let end = items.length
		if (end > 0 && items[lastIndex].type === 'prompt') {
			end = lastIndex
		}

		for (let i = 0; i < end; i++) {
			const item = items[i]
			const message = this.buildHistoryItemMessage(item, priority)
			if (message) messages.push(message)
		}

		return compactHistoryMessages(messages, priority)
	}

	private buildHistoryItemMessage(item: ChatHistoryItem, priority: number): AgentMessage | null {
		switch (item.type) {
			case 'prompt': {
				const content: AgentMessageContent[] = []

				if (item.message.trim() !== '') {
					content.push({
						type: 'text',
						text: item.message,
					})
				}

				if (item.contextItems.length > 0) {
					for (const contextItem of item.contextItems) {
						switch (contextItem.type) {
							case 'shape': {
								const simpleShape = contextItem.shape
								content.push({
									type: 'text',
									text: `[CONTEXT]: ${JSON.stringify(simpleShape)}`,
								})
								break
							}
							case 'shapes': {
								const simpleShapes = contextItem.shapes
								content.push({
									type: 'text',
									text: `[CONTEXT]: ${JSON.stringify(simpleShapes)}`,
								})
								break
							}
							default: {
								content.push({
									type: 'text',
									text: `[CONTEXT]: ${JSON.stringify(contextItem)}`,
								})
								break
							}
						}
					}
				}

				if (content.length === 0) {
					return null
				}

				return {
					role: 'user',
					content,
					priority,
				}
			}
			case 'continuation': {
				if (item.data.length === 0) {
					return null
				}
				const text = `[DATA RETRIEVED]: ${JSON.stringify(item.data)}`
				return {
					role: 'assistant',
					content: [{ type: 'text', text }],
					priority,
				}
			}
			case 'action': {
				const { action } = item
				let text: string
				switch (action._type) {
					case 'message': {
						text = action.text || '<message data lost>'
						break
					}
					case 'think': {
						text = '[THOUGHT]: ' + (action.text || '<thought data lost>')
						break
					}
					default: {
						const { complete: _complete, time: _time, ...rawAction } = action || {}
						text = '[ACTION]: ' + JSON.stringify(rawAction)
						break
					}
				}
				return {
					role: 'assistant',
					content: [{ type: 'text', text }],
					priority,
				}
			}
		}
	}
}

function compactHistoryMessages(messages: AgentMessage[], priority: number): AgentMessage[] {
	const totalCharacters = messages.reduce(
		(sum, message) => sum + getMessageCharacters(message),
		0
	)
	if (Math.ceil(totalCharacters / 4) <= HISTORY_COMPACTION_THRESHOLD_TOKENS) return messages

	let recentStart = messages.length
	let recentCharacters = 0
	while (recentStart > 0) {
		const nextCharacters = getMessageCharacters(messages[recentStart - 1])
		if (recentCharacters + nextCharacters > RECENT_HISTORY_TOKEN_BUDGET * 4) break
		recentCharacters += nextCharacters
		recentStart--
	}

	const olderMessages = messages.slice(0, recentStart)
	let summary = olderMessages
		.map((message) => {
			const text = message.content
				.filter((item) => item.type === 'text')
				.map((item) => item.text ?? '')
				.join(' ')
				.replace(/\s+/g, ' ')
				.trim()
			const clipped = text.length > 400 ? `${text.slice(0, 397)}...` : text
			return `${message.role === 'user' ? 'User' : 'Agent'}: ${clipped}`
		})
		.join('\n')

	if (summary.length > SUMMARY_CHARACTER_BUDGET) {
		summary = `...${summary.slice(-SUMMARY_CHARACTER_BUDGET)}`
	}

	return [
		{
			role: 'user',
			content: [
				{
					type: 'text',
					text: `[EARLIER CONVERSATION SUMMARY — ${olderMessages.length} entries compacted]\n${summary}`,
				},
			],
			priority,
		},
		...messages.slice(recentStart),
	]
}

function getMessageCharacters(message: AgentMessage) {
	return message.content.reduce(
		(sum, item) => sum + (item.type === 'text' ? (item.text?.length ?? 0) : 0),
		0
	)
}
