import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgentLiveLanguage } from '../lib/agentLiveOutput'

const MAX_RENDERED_LINES = 80
const MAX_HIGHLIGHT_LINE_LENGTH = 400

type CodeToken = { text: string; type?: 'tag' | 'attr' | 'string' | 'key' | 'number' | 'literal' }

const LANGUAGE_LABELS: Record<AgentLiveLanguage, { live: string; last: string; waiting: string }> = {
	html: { live: 'Live HTML', last: 'Last HTML', waiting: 'Waiting for HTML…' },
	css: { live: 'Live CSS', last: 'Last CSS', waiting: 'Waiting for CSS…' },
	javascript: { live: 'Live JS', last: 'Last JS', waiting: 'Waiting for JavaScript…' },
	json: { live: 'Live JSON', last: 'Last JSON', waiting: 'Waiting for JSON…' },
	text: { live: 'Live output', last: 'Last output', waiting: 'Waiting for output…' },
}

export function AgentLiveCodeBlock({
	language,
	filename,
	code,
	isStreaming,
}: {
	language: AgentLiveLanguage
	filename: string
	code: string
	isStreaming: boolean
}) {
	const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
	const codeRef = useRef<HTMLDivElement>(null)
	const resetCopyTimer = useRef<number | undefined>(undefined)
	const labels = LANGUAGE_LABELS[language]
	const lines = useMemo(() => getVisibleLines(code), [code])

	useEffect(() => {
		codeRef.current?.scrollTo({ top: codeRef.current.scrollHeight })
	}, [code])

	useEffect(() => () => window.clearTimeout(resetCopyTimer.current), [])

	const copy = useCallback(async () => {
		if (!code) return
		try {
			await navigator.clipboard.writeText(code)
			setCopyState('copied')
		} catch {
			setCopyState('failed')
		}
		window.clearTimeout(resetCopyTimer.current)
		resetCopyTimer.current = window.setTimeout(() => setCopyState('idle'), 1500)
	}, [code])

	return (
		<div className="agent-live-code-block">
			<div className="agent-live-code-header">
				<span className="agent-live-code-title">
					<span>{filename}</span>
					<span>{isStreaming ? labels.live : labels.last}</span>
				</span>
				<button type="button" onClick={copy} disabled={!code} aria-label={`Copy ${language}`}>
					{copyState === 'copied' ? <CheckIcon /> : <CopyIcon />}
					{copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'}
				</button>
			</div>

			<div
				className="agent-live-code-body"
				ref={codeRef}
				aria-label={isStreaming ? labels.live : labels.last}
			>
				{lines.length === 0 ? (
					<div className="agent-live-code-waiting">{labels.waiting}</div>
				) : (
					lines.map((line) => (
						<div className="agent-live-code-line" key={line.number}>
							<span className="agent-live-code-line-number" aria-hidden="true">
								{line.number}
							</span>
							<code>
								{tokenizeLine(line.text, language).map((token, tokenIndex) => (
									<span
										className={token.type ? `live-token-${token.type}` : undefined}
										key={tokenIndex}
									>
										{token.text}
									</span>
								))}
								{isStreaming && line.isLast && <span className="agent-live-code-cursor" />}
							</code>
						</div>
					))
				)}
			</div>
		</div>
	)
}

function getVisibleLines(code: string) {
	if (!code) return [] as { number: number; text: string; isLast: boolean }[]
	const allLines = code.split('\n')
	const start = Math.max(0, allLines.length - MAX_RENDERED_LINES)
	return allLines.slice(start).map((text, index) => {
		const number = start + index + 1
		return {
			number,
			text,
			isLast: number === allLines.length,
		}
	})
}

function tokenizeLine(line: string, language: AgentLiveLanguage): CodeToken[] {
	if (line.length > MAX_HIGHLIGHT_LINE_LENGTH) return [{ text: line }]
	if (language === 'html') return tokenizeHtmlLine(line)
	if (language === 'json') return tokenizeJsonLine(line)
	return [{ text: line }]
}

const HTML_TOKEN =
	/(<!--[\s\S]*?-->)|(<\/?[a-zA-Z][\w:-]*)|([a-zA-Z_:][\w:.-]*=)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(>)/g

function tokenizeHtmlLine(line: string): CodeToken[] {
	const tokens: CodeToken[] = []
	let cursor = 0

	for (const match of line.matchAll(HTML_TOKEN)) {
		if (match.index > cursor) tokens.push({ text: line.slice(cursor, match.index) })
		if (match[1]) tokens.push({ text: match[0], type: 'literal' })
		else if (match[2] || match[5]) tokens.push({ text: match[0], type: 'tag' })
		else if (match[3]) tokens.push({ text: match[0], type: 'attr' })
		else tokens.push({ text: match[0], type: 'string' })
		cursor = match.index + match[0].length
	}

	if (cursor < line.length) tokens.push({ text: line.slice(cursor) })
	return tokens.length > 0 ? tokens : [{ text: line }]
}

const JSON_TOKEN =
	/("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g

function tokenizeJsonLine(line: string): CodeToken[] {
	const tokens: CodeToken[] = []
	let cursor = 0

	for (const match of line.matchAll(JSON_TOKEN)) {
		if (match.index > cursor) tokens.push({ text: line.slice(cursor, match.index) })
		tokens.push({
			text: match[0],
			type: match[1] ? 'key' : match[2] ? 'string' : match[3] ? 'number' : 'literal',
		})
		cursor = match.index + match[0].length
	}

	if (cursor < line.length) tokens.push({ text: line.slice(cursor) })
	return tokens.length > 0 ? tokens : [{ text: line }]
}

function CopyIcon() {
	return (
		<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<rect x="9" y="9" width="12" height="12" rx="2.5" />
			<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
		</svg>
	)
}

function CheckIcon() {
	return (
		<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
			<path d="M20 6 9 17l-5-5" />
		</svg>
	)
}
