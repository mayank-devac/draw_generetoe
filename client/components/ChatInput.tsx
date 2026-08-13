import { FormEventHandler, useEffect, useRef, useState } from 'react'
import { Editor, useValue } from 'tldraw'
import {
	AGENT_MODEL_DEFINITIONS,
	AgentModelName,
	AgentThinkingLevel,
	getAgentModelDefinition,
} from '../../shared/models'
import { TldrawAgent } from '../agent/TldrawAgent'
import { AgentLiveOutput } from './AgentLiveOutput'
import { ContextItemTag } from './ContextItemTag'
import { AtIcon } from './icons/AtIcon'
import { BrainIcon } from './icons/BrainIcon'
import { ChevronDownIcon } from './icons/ChevronDownIcon'
import { PlusIcon } from './icons/PlusIcon'
import { SelectionTag } from './SelectionTag'
import { PromptTag } from './PromptTag'

export function ChatInput({
	agent,
	handleSubmit,
	inputRef,
}: {
	agent: TldrawAgent
	handleSubmit: FormEventHandler<HTMLFormElement>
	inputRef: React.RefObject<HTMLTextAreaElement>
}) {
	const { editor } = agent
	const [inputValue, setInputValue] = useState('')
	const [preferHtmlPreview, setPreferHtmlPreview] = useState(false)
	const wasGenerating = useRef(false)
	const isGenerating = useValue('isGenerating', () => agent.isGenerating(), [agent])
	const streamingJson = useValue(agent.$streamingJson)
	const jsonHistory = useValue(agent.$jsonHistory)
	const displayedJson = isGenerating ? streamingJson : streamingJson || jsonHistory.at(-1) || ''

	const isContextToolActive = useValue(
		'isContextToolActive',
		() => {
			const tool = editor.getCurrentTool()
			return tool.id === 'target-shape' || tool.id === 'target-area'
		},
		[editor]
	)

	const selectedShapes = useValue('selectedShapes', () => editor.getSelectedShapes(), [editor])
	const contextItems = useValue(agent.$contextItems)
	const modelName = useValue(agent.$modelName)
	const modelDefinition = getAgentModelDefinition(modelName)
	const thinkingLevel = useValue(
		'thinkingLevel',
		() => agent.getThinkingLevel(modelName),
		[agent, modelName]
	)
	const thinkingLabel = modelDefinition.thinkingOptions.find(
		(option) => option.value === thinkingLevel
	)?.label

	useEffect(() => {
		if (wasGenerating.current && !isGenerating) {
			setPreferHtmlPreview(false)
		}
		wasGenerating.current = isGenerating
	}, [isGenerating])

	return (
		<div className="chat-input">
			<form
				onSubmit={(e) => {
					e.preventDefault()
					setInputValue('')
					handleSubmit(e)
				}}
			>
				<AgentLiveOutput
					json={displayedJson}
					isStreaming={isGenerating}
					preferLanguage={preferHtmlPreview ? 'html' : undefined}
				/>
				<div className="prompt-tags">
					<div className={'chat-plus-select' + (preferHtmlPreview ? ' active' : '')}>
						<div className="chat-plus-select-label">
							<PlusIcon />
						</div>
						<select
							aria-label="Add to prompt"
							value=" "
							onChange={(e) => {
								if (e.target.value === 'html-view') setPreferHtmlPreview(true)
							}}
						>
							<option value=" "> </option>
							<option value="html-view">HTML view</option>
						</select>
					</div>
					<div className={'chat-context-select ' + (isContextToolActive ? 'active' : '')}>
						<div className="chat-context-select-label">
							<AtIcon /> Add Context
						</div>
						<select
							id="chat-context-select"
							value=" "
							onChange={(e) => {
								const action = ADD_CONTEXT_ACTIONS.find((action) => action.name === e.target.value)
								if (action) action.onSelect(editor)
							}}
						>
							{ADD_CONTEXT_ACTIONS.map((action) => {
								return (
									<option key={action.name} value={action.name}>
										{action.name}
									</option>
								)
							})}
						</select>
					</div>
					{preferHtmlPreview && (
						<PromptTag
							text="HTML view"
							icon="window"
							onClick={() => setPreferHtmlPreview(false)}
						/>
					)}
					{selectedShapes.length > 0 && <SelectionTag onClick={() => editor.selectNone()} />}
					{contextItems.map((item, i) => (
						<ContextItemTag
							editor={editor}
							onClick={() => agent.removeFromContext(item)}
							key={'context-item-' + i}
							item={item}
						/>
					))}
				</div>

				<input type="hidden" name="preferHtmlPreview" value={preferHtmlPreview ? '1' : ''} />
				<textarea
					ref={inputRef}
					name="input"
					autoComplete="off"
					placeholder="Ask, learn, brainstorm, draw"
					value={inputValue}
					onInput={(e) => setInputValue(e.currentTarget.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault()
							//idk about this but it works oops -max
							const form = e.currentTarget.closest('form')
							if (form) {
								const submitEvent = new Event('submit', { bubbles: true, cancelable: true })
								form.dispatchEvent(submitEvent)
							}
						}
					}}
				/>
				<span className="chat-actions">
					<div className="chat-actions-left">
						<div className="chat-model-select">
							<div className="chat-model-select-label">
								<BrainIcon /> {modelDefinition.displayName}
							</div>
							<select
								value={modelName}
								onChange={(e) => agent.$modelName.set(e.target.value as AgentModelName)}
							>
								{Object.values(AGENT_MODEL_DEFINITIONS).map((model) => (
									<option key={model.name} value={model.name}>
										{model.displayName}
									</option>
								))}
							</select>
							<ChevronDownIcon />
						</div>
						{thinkingLevel && thinkingLabel && (
							<div className="chat-thinking-select">
								<div className="chat-thinking-select-label">Thinking: {thinkingLabel}</div>
								<select
									aria-label={`Thinking level for ${modelDefinition.displayName}`}
									value={thinkingLevel}
									onChange={(e) =>
										agent.setThinkingLevel(
											modelName,
											e.target.value as AgentThinkingLevel
										)
									}
								>
									{modelDefinition.thinkingOptions.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
								<ChevronDownIcon />
							</div>
						)}
					</div>
					<button className="chat-input-submit" disabled={inputValue === '' && !isGenerating}>
						{isGenerating && inputValue === '' ? '◼' : '⬆'}
					</button>
				</span>
			</form>
		</div>
	)
}

const ADD_CONTEXT_ACTIONS = [
	{
		name: 'Pick Shapes',
		onSelect: (editor: Editor) => {
			editor.setCurrentTool('target-shape')
			editor.focus()
		},
	},
	{
		name: 'Pick Area',
		onSelect: (editor: Editor) => {
			editor.setCurrentTool('target-area')
			editor.focus()
		},
	},
	{
		name: ' ',
		onSelect: (editor: Editor) => {
			const currentTool = editor.getCurrentTool()
			if (currentTool.id === 'target-area' || currentTool.id === 'target-shape') {
				editor.setCurrentTool('select')
			}
		},
	},
]
