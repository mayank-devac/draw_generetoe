import {
	HTML_PREVIEW_SNAPSHOT_REQUEST,
	HTML_PREVIEW_SNAPSHOT_RESULT,
	wrapHtmlPreviewDocument,
} from '../../shared/format/htmlPreview'

const SNAPSHOT_TIMEOUT_MS = 700

export function requestIframeSnapshot(iframe: HTMLIFrameElement) {
	return new Promise<string>((resolve) => {
		const target = iframe.contentWindow
		if (!target) {
			resolve('')
			return
		}

		const timeout = window.setTimeout(() => {
			window.removeEventListener('message', onMessage)
			resolve('')
		}, SNAPSHOT_TIMEOUT_MS)

		function onMessage(event: MessageEvent) {
			if (event.source !== target) return
			if (!event.data || event.data.type !== HTML_PREVIEW_SNAPSHOT_RESULT) return
			window.clearTimeout(timeout)
			window.removeEventListener('message', onMessage)
			resolve(typeof event.data.data === 'string' ? event.data.data : '')
		}

		window.addEventListener('message', onMessage)
		target.postMessage(HTML_PREVIEW_SNAPSHOT_REQUEST, '*')
	})
}

export async function captureHtmlPreviewThumbnail({
	html,
	title,
	width,
	height,
}: {
	html: string
	title: string
	width: number
	height: number
}) {
	if (!html.trim() || typeof document === 'undefined') return ''

	const iframe = document.createElement('iframe')
	iframe.setAttribute('sandbox', 'allow-scripts allow-forms')
	iframe.setAttribute('referrerpolicy', 'no-referrer')
	iframe.title = 'HTML preview snapshot'
	iframe.srcdoc = wrapHtmlPreviewDocument(html, title)
	iframe.style.cssText = [
		'position:fixed',
		'left:-10000px',
		'top:0',
		`width:${Math.max(160, Math.round(width))}px`,
		`height:${Math.max(120, Math.round(height))}px`,
		'border:0',
		'opacity:0',
		'pointer-events:none',
	].join(';')

	document.body.appendChild(iframe)

	try {
		await waitForIframeLoad(iframe)
		await waitForPaint()
		return await requestIframeSnapshot(iframe)
	} catch {
		return ''
	} finally {
		iframe.remove()
	}
}

function waitForIframeLoad(iframe: HTMLIFrameElement) {
	return new Promise<void>((resolve) => {
		const timeout = window.setTimeout(() => resolve(), 400)
		iframe.addEventListener(
			'load',
			() => {
				window.clearTimeout(timeout)
				resolve()
			},
			{ once: true }
		)
	})
}

function waitForPaint() {
	return new Promise<void>((resolve) => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => resolve())
		})
	})
}
