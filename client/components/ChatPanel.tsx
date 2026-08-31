import {
	FormEventHandler,
	KeyboardEvent as ReactKeyboardEvent,
	PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
	type CSSProperties,
} from 'react'
import { ErrorBoundary, useValue } from 'tldraw'
import { convertTldrawShapeToSimpleShape } from '../../shared/format/convertTldrawShapeToSimpleShape'
import { AgentTokenUsage } from '../../shared/types/Streaming'
import { TldrawAgent } from '../agent/TldrawAgent'
import { ChatHistory } from './chat-history/ChatHistory'
import { ChatInput } from './ChatInput'
import { ChatPanelFallback } from './ChatPanelFallback'
import { ChevronRightIcon } from './icons/ChevronRightIcon'
import { McpConnectionCard } from './McpConnectionCard'
import { TodoList } from './TodoList'

const CHAT_WIDTH_KEY = 'tldraw-agent-chat-width'
const DEFAULT_CHAT_WIDTH = 350
const MIN_CHAT_WIDTH = 280
const MAX_CHAT_WIDTH = 900
const COLLAPSED_CHAT_WIDTH = 40
const MIN_CANVAS_WIDTH = 280
const RESIZE_STEP = 32

function clampChatWidth(width: number) {
	const max = Math.min(
		MAX_CHAT_WIDTH,
		Math.max(MIN_CHAT_WIDTH, window.innerWidth - MIN_CANVAS_WIDTH)
	)
	return Math.round(Math.min(max, Math.max(MIN_CHAT_WIDTH, width)))
}

function readStored(key: string) {
	try {
		return localStorage.getItem(key)
	} catch {
		return null
	}
}

function writeStored(key: string, value: string) {
	try {
		localStorage.setItem(key, value)
	} catch {
		// Private mode / quota — ignore.
	}
}

function loadChatWidth() {
	const raw = Number(readStored(CHAT_WIDTH_KEY))
	if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_CHAT_WIDTH
	return clampChatWidth(raw)
}

export function ChatPanel({ agent }: { agent: TldrawAgent }) {
	const { editor } = agent
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const [width, setWidth] = useState(loadChatWidth)
	const widthRef = useRef(width)
	const [collapsed, setCollapsed] = useState(true)
	const collapsedRef = useRef(collapsed)
	const [resizing, setResizing] = useState(false)
	const modelName = useValue(agent.$modelName)
	const lastTokenUsage = useValue(agent.$lastTokenUsage)
	const thinkingLevel = useValue(
		'thinkingLevel',
		() => agent.getThinkingLevel(modelName),
		[agent, modelName]
	)

	useEffect(() => {
		widthRef.current = width
	}, [width])

	useEffect(() => {
		collapsedRef.current = collapsed
	}, [collapsed])

	useEffect(() => {
		document.body.classList.toggle('is-chat-resizing', resizing)
		return () => document.body.classList.remove('is-chat-resizing')
	}, [resizing])

	useEffect(() => {
		const onWindowResize = () => {
			const nextWidth = clampChatWidth(widthRef.current)
			if (nextWidth === widthRef.current) return
			widthRef.current = nextWidth
			setWidth(nextWidth)
			writeStored(CHAT_WIDTH_KEY, String(nextWidth))
		}
		window.addEventListener('resize', onWindowResize)
		return () => window.removeEventListener('resize', onWindowResize)
	}, [])

	const commitWidth = useCallback((nextWidth: number) => {
		const clamped = clampChatWidth(nextWidth)
		widthRef.current = clamped
		setWidth(clamped)
		writeStored(CHAT_WIDTH_KEY, String(clamped))
	}, [])

	const handleResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return
		if ((event.target as HTMLElement).closest('button')) return
		event.preventDefault()
		event.stopPropagation()

		if (collapsedRef.current) {
			setCollapsed(false)
			return
		}

		const pointerId = event.pointerId
		const startX = event.clientX
		const startWidth = widthRef.current
		setResizing(true)

		const onMove = (moveEvent: PointerEvent) => {
			if (moveEvent.pointerId !== pointerId) return
			const nextWidth = clampChatWidth(startWidth + (startX - moveEvent.clientX))
			widthRef.current = nextWidth
			setWidth(nextWidth)
		}

		const onUp = (upEvent: PointerEvent) => {
			if (upEvent.pointerId !== pointerId) return
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
			window.removeEventListener('pointercancel', onUp)
			setResizing(false)
			writeStored(CHAT_WIDTH_KEY, String(widthRef.current))
		}

		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
		window.addEventListener('pointercancel', onUp)
	}, [])

	const handleResizeDoubleClick = useCallback(() => {
		if (collapsedRef.current) return
		commitWidth(DEFAULT_CHAT_WIDTH)
	}, [commitWidth])

	const handleResizeKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLDivElement>) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault()
				setCollapsed((value) => !value)
				return
			}
			if (collapsedRef.current) return
			if (event.key === 'ArrowLeft') {
				event.preventDefault()
				commitWidth(widthRef.current + RESIZE_STEP)
			} else if (event.key === 'ArrowRight') {
				event.preventDefault()
				commitWidth(widthRef.current - RESIZE_STEP)
			} else if (event.key === 'Home') {
				event.preventDefault()
				commitWidth(DEFAULT_CHAT_WIDTH)
			}
		},
		[commitWidth]
	)

	const toggleCollapsed = useCallback(() => {
		setCollapsed((value) => !value)
	}, [])

	const handleSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
		async (e) => {
			e.preventDefault()
			if (!inputRef.current) return
			const formData = new FormData(e.currentTarget)
			const value = formData.get('input') as string

			// If the user's message is empty, just cancel the current request (if there is one)
			if (value === '') {
				agent.cancel()
				return
			}

			// If every todo is done, clear the todo list
			const todosRemaining = agent.$todoList.get().filter((item) => item.status !== 'done')
			if (todosRemaining.length === 0) {
				agent.$todoList.set([])
			}

			// Grab the user query and clear the chat input
			const message = value
			const contextItems = agent.$contextItems.get()
			agent.$contextItems.set([])
			inputRef.current.value = ''

			// Prompt the agent
			const selectedShapes = editor
				.getSelectedShapes()
				.map((shape) => convertTldrawShapeToSimpleShape(editor, shape))

			const preferHtmlPreview = formData.get('preferHtmlPreview') === '1'

			await agent.prompt({
				message,
				contextItems,
				bounds: editor.getViewportPageBounds(),
				modelName,
				thinkingLevel,
				selectedShapes,
				type: 'user',
				preferHtmlPreview,
			})
		},
		[agent, modelName, thinkingLevel, editor]
	)

	return (
		<div
			className={`chat-panel tl-theme__dark${collapsed ? ' is-collapsed' : ''}${resizing ? ' is-resizing' : ''}`}
			style={
				{
					'--chat-panel-width': `${collapsed ? COLLAPSED_CHAT_WIDTH : width}px`,
				} as CSSProperties
			}
		>
			<div
				className="chat-resize-handle"
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize chat"
				aria-valuemin={MIN_CHAT_WIDTH}
				aria-valuemax={MAX_CHAT_WIDTH}
				aria-valuenow={collapsed ? COLLAPSED_CHAT_WIDTH : width}
				tabIndex={0}
				onPointerDown={handleResizePointerDown}
				onDoubleClick={handleResizeDoubleClick}
				onKeyDown={handleResizeKeyDown}
			>
				<button
					type="button"
					className="chat-collapse-button"
					title={collapsed ? 'Expand chat' : 'Collapse chat'}
					aria-label={collapsed ? 'Expand chat' : 'Collapse chat'}
					aria-expanded={!collapsed}
					tabIndex={-1}
					onPointerDown={(event) => event.stopPropagation()}
					onClick={toggleCollapsed}
				>
					<span className={`chat-collapse-icon${collapsed ? ' is-collapsed' : ''}`}>
						<ChevronRightIcon />
					</span>
				</button>
			</div>
			<ErrorBoundary fallback={ChatPanelFallback}>
				<div className="chat-header">
					<span
						className="chat-token-counter"
						title={getTokenUsageLabel(lastTokenUsage, false)}
					>
						{getTokenUsageLabel(lastTokenUsage, true)}
					</span>
					<McpConnectionCard agent={agent} />
				</div>
				<ChatHistory agent={agent} />
				<div className="chat-input-container">
					<TodoList agent={agent} />
					<ChatInput agent={agent} handleSubmit={handleSubmit} inputRef={inputRef} />
				</div>
			</ErrorBoundary>
		</div>
	)
}

function getTokenUsageLabel(usage: AgentTokenUsage | null, compact: boolean) {
	if (!usage) return 'Tokens —'

	const parts = [
		`${formatTokens(usage.inputTokens)} in`,
		`${formatTokens(usage.outputTokens)} out`,
	]
	if (usage.reasoningTokens > 0) parts.push(`${formatTokens(usage.reasoningTokens)} thinking`)
	if (usage.cachedInputTokens > 0) parts.push(`${formatTokens(usage.cachedInputTokens)} cached`)

	return compact ? parts.join(' · ') : `${parts.join(' · ')} · ${formatTokens(usage.totalTokens)} total`
}

function formatTokens(tokens: number) {
	if (tokens < 1_000) return String(tokens)
	if (tokens < 10_000) return `${(tokens / 1_000).toFixed(1)}k`
	return `${Math.round(tokens / 1_000)}k`
}
