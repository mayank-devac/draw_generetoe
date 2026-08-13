export type AgentLiveLanguage = 'html' | 'css' | 'javascript' | 'json' | 'text'

export interface AgentLivePreview {
	language: AgentLiveLanguage
	filename: string
	code: string
}

type LiveOutputExtractor = (json: string) => AgentLivePreview | null

const LIVE_OUTPUT_EXTRACTORS: LiveOutputExtractor[] = [extractHtmlPreview]

/** Register another live-code extractor (CSS, JS, etc.) without changing the viewer. */
export function registerLiveOutputExtractor(extractor: LiveOutputExtractor) {
	LIVE_OUTPUT_EXTRACTORS.push(extractor)
}

export function getAgentLivePreview(json: string): AgentLivePreview | null {
	if (!json) return null
	for (const extract of LIVE_OUTPUT_EXTRACTORS) {
		const preview = extract(json)
		if (preview) return preview
	}
	return null
}

export function isHtmlLiveOutput(json: string, actionType?: string) {
	if (actionType === 'createHtmlPreview') return true
	return json.includes('createHtmlPreview')
}

function extractHtmlPreview(json: string): AgentLivePreview | null {
	if (!json.includes('createHtmlPreview') && !looksLikeHtmlField(json)) return null
	const html = extractJsonStringField(json, 'html') ?? ''
	const title = extractJsonStringField(json, 'title')
	return {
		language: 'html',
		filename: toHtmlFilename(title),
		code: html,
	}
}

function looksLikeHtmlField(json: string) {
	const html = extractJsonStringField(json, 'html')
	if (!html) return false
	return /<\/?[a-z][\s\S]*>/i.test(html) || html.includes('<!DOCTYPE')
}

function toHtmlFilename(title: string | null) {
	if (!title) return 'preview.html'
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
	return slug ? `${slug}.html` : 'preview.html'
}

export function extractJsonStringField(json: string, field: string): string | null {
	const marker = `"${field}"`
	let searchFrom = 0

	while (searchFrom < json.length) {
		const keyIndex = json.indexOf(marker, searchFrom)
		if (keyIndex === -1) return null

		let cursor = keyIndex + marker.length
		while (cursor < json.length && (json[cursor] === ' ' || json[cursor] === '\t' || json[cursor] === '\n')) {
			cursor++
		}
		if (json[cursor] !== ':') {
			searchFrom = keyIndex + 1
			continue
		}
		cursor++
		while (cursor < json.length && (json[cursor] === ' ' || json[cursor] === '\t' || json[cursor] === '\n')) {
			cursor++
		}
		if (json[cursor] !== '"') {
			searchFrom = keyIndex + 1
			continue
		}

		return unescapePartialJsonString(json.slice(cursor + 1))
	}

	return null
}

function unescapePartialJsonString(raw: string) {
	let out = ''
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i]
		if (ch === '"') break
		if (ch !== '\\') {
			out += ch
			continue
		}

		const next = raw[i + 1]
		if (next === undefined) break

		switch (next) {
			case 'n':
				out += '\n'
				break
			case 't':
				out += '\t'
				break
			case 'r':
				out += '\r'
				break
			case '"':
			case '\\':
			case '/':
				out += next
				break
			case 'u': {
				const hex = raw.slice(i + 2, i + 6)
				if (/^[0-9a-fA-F]{4}$/.test(hex)) {
					out += String.fromCharCode(parseInt(hex, 16))
					i += 5
					continue
				}
				out += next
				break
			}
			default:
				out += next
		}
		i++
	}
	return out
}
