import { useEffect, useMemo, useRef, useState } from 'react'
import { useToasts, useValue } from 'tldraw'
import { MCP_ENDPOINT } from '../../shared/mcp/protocol'
import { ChatHistoryItem } from '../../shared/types/ChatHistoryItem'
import { TldrawAgent } from '../agent/TldrawAgent'
import {
	importCanvasJsonText,
	looksLikeCanvasImportJson,
} from '../lib/importCanvasJson'
import { getMcpCanvasBridge, McpCanvasBridgeState, McpCanvasStatus } from '../mcp/McpCanvasBridge'
import { EllipsisIcon } from './icons/EllipsisIcon'

const CODEX_COMMAND = `codex mcp add tldraw-canvas --url ${MCP_ENDPOINT}`
const CODEX_CONFIG = `[mcp_servers."tldraw-canvas"]\nurl = "${MCP_ENDPOINT}"`

const STATUS_LABELS: Record<McpCanvasStatus, string> = {
	'bridge-offline': 'Bridge offline',
	disconnected: 'Disconnected',
	waiting: 'Waiting for assistant',
	connected: 'Connected',
	drawing: 'Drawing',
	busy: 'Busy',
	error: 'Error',
}

export function McpConnectionCard({ agent }: { agent: TldrawAgent }) {
	const bridge = useMemo(() => getMcpCanvasBridge(agent), [agent])
	const toasts = useToasts()
	const [state, setState] = useState<McpCanvasBridgeState>(bridge.getState())
	const [menuOpen, setMenuOpen] = useState(false)
	const [showSetup, setShowSetup] = useState(false)
	const [showImport, setShowImport] = useState(false)
	const menuRef = useRef<HTMLDivElement>(null)
	const chatHistory = useValue(agent.$chatHistory)
	const hasConversation = chatHistory.length > 0

	useEffect(() => {
		const unsubscribe = bridge.subscribe(setState)
		bridge.start()
		return () => {
			unsubscribe()
			bridge.dispose()
		}
	}, [bridge])

	useEffect(() => {
		if (!menuOpen) return

		function handlePointerDown(event: PointerEvent) {
			if (!menuRef.current?.contains(event.target as Node)) {
				setMenuOpen(false)
			}
		}

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				setMenuOpen(false)
			}
		}

		document.addEventListener('pointerdown', handlePointerDown)
		document.addEventListener('keydown', handleKeyDown)
		return () => {
			document.removeEventListener('pointerdown', handlePointerDown)
			document.removeEventListener('keydown', handleKeyDown)
		}
	}, [menuOpen])

	useEffect(() => {
		function handlePaste(event: ClipboardEvent) {
			const target = event.target as HTMLElement | null
			if (target?.closest('textarea, input, [contenteditable="true"]')) return

			const text = event.clipboardData?.getData('text/plain')?.trim()
			if (!text || !looksLikeCanvasImportJson(text)) return

			event.preventDefault()
			event.stopPropagation()

			try {
				const result = importCanvasJsonText(agent.editor, text)
				toasts.addToast({
					title: 'Imported JSON',
					description:
						result.imported === 1
							? '1 shape placed at canvas center'
							: `${result.imported} shapes placed at canvas center`,
					severity: 'success',
				})
				if (result.warnings.length > 0) {
					toasts.addToast({
						title: 'Import notes',
						description: result.warnings.slice(0, 2).join(' · '),
						severity: 'warning',
					})
				}
			} catch (error) {
				toasts.addToast({
					title: 'Import failed',
					description: error instanceof Error ? error.message : 'Could not import JSON',
					severity: 'error',
				})
			}
		}

		window.addEventListener('paste', handlePaste, true)
		return () => window.removeEventListener('paste', handlePaste, true)
	}, [agent.editor, toasts])

	const isCanvasConnected = ['waiting', 'connected', 'drawing', 'busy', 'error'].includes(
		state.status
	)

	return (
		<>
			<div className="mcp-menu" ref={menuRef}>
				<button
					type="button"
					className="mcp-menu-button"
					aria-label="Chat and canvas menu"
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					onClick={() => setMenuOpen((open) => !open)}
					title={`MCP: ${STATUS_LABELS[state.status]}`}
				>
					<span className={`mcp-status-dot mcp-status-dot--${state.status}`} aria-hidden="true" />
					<EllipsisIcon />
				</button>

				{menuOpen && (
					<section className="mcp-card" aria-label="Chat and canvas menu" role="menu">
						<div className="mcp-card-heading">
							<div>
								<div className="mcp-card-eyebrow">LOCAL MCP</div>
								<div className="mcp-card-title">AI canvas control</div>
							</div>
							<div className={`mcp-status mcp-status--${state.status}`}>
								<span className="mcp-status-dot" aria-hidden="true" />
								{STATUS_LABELS[state.status]}
							</div>
						</div>

						{state.detail && <p className="mcp-card-detail">{state.detail}</p>}

						<div className="mcp-card-actions">
							<span className="mcp-menu-section-label">Chat</span>
							<button
								type="button"
								onClick={() => {
									agent.reset()
									setMenuOpen(false)
								}}
							>
								New chat
							</button>
							<button
								type="button"
								disabled={!hasConversation}
								onClick={() => {
									agent.cancel()
									agent.$chatHistory.set([])
									agent.$jsonHistory.set([])
									agent.$streamingJson.set('')
									setMenuOpen(false)
									toasts.addToast({
										title: 'Chat cleared',
										description: 'The whole conversation was removed',
										severity: 'success',
									})
								}}
							>
								Clear chat history
							</button>
							<button
								type="button"
								disabled={!hasConversation}
								onClick={() => {
									selectChatConversation(agent)
									setMenuOpen(false)
									toasts.addToast({
										title: 'Conversation selected',
										description: 'Copied the chat so you can paste it',
										severity: 'success',
									})
								}}
							>
								Select conversation
							</button>
							<span className="mcp-menu-section-label">Canvas</span>
							{isCanvasConnected ? (
								<button type="button" onClick={() => bridge.disconnect()}>
									Disconnect
								</button>
							) : (
								<button
									type="button"
									className="mcp-primary-button"
									onClick={() => bridge.connect()}
								>
									Connect Canvas
								</button>
							)}
							<button
								type="button"
								disabled={!state.undoAvailable || state.status === 'drawing'}
								onClick={() => void bridge.undoFromUi()}
								title={
									state.undoAvailable
										? 'Undo the latest MCP drawing batch'
										: 'Available only until the next document edit'
								}
							>
								Undo AI Change
							</button>
							<button
								type="button"
								onClick={() => {
									setMenuOpen(false)
									setShowImport(true)
								}}
							>
								Import JSON
							</button>
							<button
								type="button"
								onClick={() => {
									setMenuOpen(false)
									setShowSetup(true)
								}}
							>
								Setup MCP
							</button>
						</div>
					</section>
				)}
			</div>

			{showSetup && <McpSetupModal onClose={() => setShowSetup(false)} />}
			{showImport && (
				<ImportJsonModal
					agent={agent}
					onClose={() => setShowImport(false)}
					onImported={(message, severity) => {
						toasts.addToast({
							title: severity === 'error' ? 'Import failed' : 'Imported JSON',
							description: message,
							severity: severity,
						})
					}}
				/>
			)}
		</>
	)
}

function ImportJsonModal({
	agent,
	onClose,
	onImported,
}: {
	agent: TldrawAgent
	onClose: () => void
	onImported: (message: string, severity: 'success' | 'error' | 'warning') => void
}) {
	const [text, setText] = useState('')
	const [error, setError] = useState<string | null>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)

	function runImport(raw: string) {
		try {
			const result = importCanvasJsonText(agent.editor, raw)
			onImported(
				result.imported === 1
					? '1 shape placed at canvas center'
					: `${result.imported} shapes placed at canvas center`,
				'success'
			)
			if (result.warnings.length > 0) {
				onImported(result.warnings.slice(0, 2).join(' · '), 'warning')
			}
			onClose()
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Could not import JSON'
			setError(message)
			onImported(message, 'error')
		}
	}

	async function handleFile(file: File | undefined) {
		if (!file) return
		const contents = await file.text()
		setText(contents)
		setError(null)
		runImport(contents)
	}

	return (
		<div className="mcp-modal-backdrop" role="presentation" onMouseDown={onClose}>
			<div
				className="mcp-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="mcp-import-title"
				onMouseDown={(event) => event.stopPropagation()}
			>
				<div className="mcp-modal-header">
					<div>
						<div className="mcp-card-eyebrow">CANVAS</div>
						<h2 id="mcp-import-title">Import JSON</h2>
					</div>
					<button
						type="button"
						className="mcp-modal-close"
						onClick={onClose}
						aria-label="Close import"
					>
						×
					</button>
				</div>

				<div className="mcp-modal-content">
					<p>
						Paste shape JSON or upload a <code>.json</code> file. Shapes are placed at the center
						of the current viewport.
					</p>
					<textarea
						className="mcp-import-textarea"
						value={text}
						onChange={(event) => {
							setText(event.target.value)
							setError(null)
						}}
						placeholder='[{"_type":"rectangle","shapeId":"box1","x":0,"y":0,"w":100,"h":80,"color":"black","fill":"none","note":""}]'
						spellCheck={false}
					/>
					{error && <p className="mcp-import-error">{error}</p>}
					<div className="mcp-import-actions">
						<input
							ref={fileInputRef}
							type="file"
							accept="application/json,.json"
							hidden
							onChange={(event) => void handleFile(event.target.files?.[0])}
						/>
						<button type="button" onClick={() => fileInputRef.current?.click()}>
							Upload JSON
						</button>
						<button
							type="button"
							className="mcp-primary-button"
							disabled={!text.trim()}
							onClick={() => runImport(text)}
						>
							Import to Canvas
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}

function McpSetupModal({ onClose }: { onClose: () => void }) {
	const [tab, setTab] = useState<'codex' | 'generic'>('codex')
	const [copied, setCopied] = useState<string | null>(null)

	async function copy(label: string, value: string) {
		await navigator.clipboard.writeText(value)
		setCopied(label)
		window.setTimeout(() => setCopied(null), 1_500)
	}

	return (
		<div className="mcp-modal-backdrop" role="presentation" onMouseDown={onClose}>
			<div
				className="mcp-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="mcp-setup-title"
				onMouseDown={(event) => event.stopPropagation()}
			>
				<div className="mcp-modal-header">
					<div>
						<div className="mcp-card-eyebrow">LOCAL CONNECTION</div>
						<h2 id="mcp-setup-title">Setup MCP</h2>
					</div>
					<button type="button" className="mcp-modal-close" onClick={onClose} aria-label="Close setup">
						×
					</button>
				</div>

				<div className="mcp-tabs" role="tablist" aria-label="MCP client">
					<button
						type="button"
						role="tab"
						aria-selected={tab === 'codex'}
						className={tab === 'codex' ? 'is-active' : ''}
						onClick={() => setTab('codex')}
					>
						Codex
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={tab === 'generic'}
						className={tab === 'generic' ? 'is-active' : ''}
						onClick={() => setTab('generic')}
					>
						Generic MCP
					</button>
				</div>

				{tab === 'codex' ? (
					<div className="mcp-modal-content">
						<p>With the bridge running, add it to Codex from Terminal:</p>
						<CopyBlock
							label="command"
							value={CODEX_COMMAND}
							copied={copied}
							onCopy={copy}
						/>
						<p>Or add the same server to a project or global Codex config:</p>
						<CopyBlock
							label="config"
							value={CODEX_CONFIG}
							copied={copied}
							onCopy={copy}
						/>
						<ol>
							<li>Select Connect Canvas here.</li>
							<li>Restart Codex or begin a new task after adding the server.</li>
							<li>Use <code>/mcp</code> in Codex to verify that tldraw-canvas is available.</li>
						</ol>
					</div>
				) : (
					<div className="mcp-modal-content">
						<p>Configure a client that supports MCP Streamable HTTP:</p>
						<CopyBlock
							label="endpoint"
							value={MCP_ENDPOINT}
							copied={copied}
							onCopy={copy}
						/>
						<dl className="mcp-details-list">
							<div>
								<dt>Transport</dt>
								<dd>Streamable HTTP</dd>
							</div>
							<div>
								<dt>Authentication</dt>
								<dd>None — local computer only</dd>
							</div>
						</dl>
						<p>
							Only one MCP assistant can control the canvas at a time. This does not install a
							Claude Desktop extension or modify any client configuration automatically.
						</p>
					</div>
				)}
			</div>
		</div>
	)
}

function CopyBlock({
	label,
	value,
	copied,
	onCopy,
}: {
	label: string
	value: string
	copied: string | null
	onCopy: (label: string, value: string) => Promise<void>
}) {
	return (
		<div className="mcp-copy-block">
			<pre>{value}</pre>
			<button type="button" onClick={() => void onCopy(label, value)}>
				{copied === label ? 'Copied' : 'Copy'}
			</button>
		</div>
	)
}

function selectChatConversation(agent: TldrawAgent) {
	const historyEl = document.querySelector('.chat-history')
	if (historyEl) {
		const range = document.createRange()
		range.selectNodeContents(historyEl)
		const selection = window.getSelection()
		selection?.removeAllRanges()
		selection?.addRange(range)
	}

	const transcript = getChatTranscript(agent.$chatHistory.get())
	if (transcript) {
		void navigator.clipboard.writeText(transcript)
	}
}

function getChatTranscript(items: ChatHistoryItem[]) {
	const lines: string[] = []
	for (const item of items) {
		if (item.type === 'prompt') {
			lines.push(`You: ${item.message}`)
			continue
		}
		if (item.type === 'action' && item.action._type === 'message' && 'text' in item.action) {
			const text = item.action.text
			if (typeof text === 'string' && text.trim()) {
				lines.push(`Agent: ${text}`)
			}
		}
	}
	return lines.join('\n\n')
}
