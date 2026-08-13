export const HTML_PREVIEW_SHAPE_TYPE = 'html-preview' as const
export const HTML_PREVIEW_SNAPSHOT_REQUEST = 'tldraw-html-preview-snapshot'
export const HTML_PREVIEW_SNAPSHOT_RESULT = 'tldraw-html-preview-snapshot-result'

const SNAPSHOT_AGENT_JS =
	'(function(){' +
	'function send(data){try{parent.postMessage({type:"' +
	HTML_PREVIEW_SNAPSHOT_RESULT +
	'",data:data||""},"*")}catch(e){}}' +
	'function capture(){try{' +
	'var canvases=Array.prototype.slice.call(document.querySelectorAll("canvas")).filter(function(c){return c.width>0&&c.height>0});' +
	'if(canvases.length){var source=canvases[0];for(var i=1;i<canvases.length;i++){if(canvases[i].width*canvases[i].height>source.width*source.height)source=canvases[i]}' +
	'var maxW=360;var scale=Math.min(1,maxW/source.width);var out=document.createElement("canvas");out.width=Math.max(1,Math.round(source.width*scale));out.height=Math.max(1,Math.round(source.height*scale));' +
	'var ctx=out.getContext("2d");ctx.fillStyle="#f7f7f5";ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(source,0,0,out.width,out.height);send(out.toDataURL("image/jpeg",0.65));return}' +
	'var w=Math.max(1,document.documentElement.clientWidth||640);var h=Math.max(1,document.documentElement.clientHeight||480);' +
	'var node=document.body||document.documentElement;var xhtml=new XMLSerializer().serializeToString(node);' +
	'if(xhtml.indexOf("xmlns=")===-1){xhtml=xhtml.replace(/<([a-zA-Z0-9]+)/,\'<$1 xmlns="http://www.w3.org/1999/xhtml"\')}' +
	'var svg=\'<svg xmlns="http://www.w3.org/2000/svg" width="\'+w+\'" height="\'+h+\'"><foreignObject width="100%" height="100%">\'+xhtml+"</foreignObject></svg>";' +
	'var blob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"});var url=URL.createObjectURL(blob);var img=new Image();' +
	'img.onload=function(){var maxW=360;var scale=Math.min(1,maxW/w);var out=document.createElement("canvas");out.width=Math.max(1,Math.round(w*scale));out.height=Math.max(1,Math.round(h*scale));' +
	'var ctx=out.getContext("2d");ctx.fillStyle="#f7f7f5";ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(img,0,0,out.width,out.height);URL.revokeObjectURL(url);send(out.toDataURL("image/jpeg",0.65))};' +
	'img.onerror=function(){URL.revokeObjectURL(url);send("")};img.src=url' +
	'}catch(e){send("")}}' +
	'window.addEventListener("message",function(event){if(event.data==="' +
	HTML_PREVIEW_SNAPSHOT_REQUEST +
	'")capture()})' +
	'})()'

function snapshotAgentTag() {
	return '<script data-tldraw-snapshot="1">' + SNAPSHOT_AGENT_JS + '</scr' + 'ipt>'
}

const DEFAULT_PREVIEW_CSS = `
html, body {
	margin: 0;
	padding: 0;
	width: 100%;
	height: 100%;
	background: #f7f7f5;
	color: #1a1a1a;
	font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
	font-size: 14px;
	line-height: 1.45;
}
body {
	box-sizing: border-box;
	padding: 16px;
	overflow: auto;
}
*, *::before, *::after { box-sizing: border-box; }
button, input, select, textarea {
	font: inherit;
}
h1, h2, h3 { margin: 0 0 8px; line-height: 1.2; }
p { margin: 0 0 10px; }
`

function escapeHtml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

export function stripHtmlCodeFences(html: string) {
	return html
		.trim()
		.replace(/^```(?:html|HTML)?\s*/i, '')
		.replace(/\s*```$/i, '')
		.trim()
}

/**
 * Turn a model-produced HTML fragment or document into a sandboxed srcdoc.
 * External network access is blocked except for images.
 */
export function wrapHtmlPreviewDocument(html: string, title: string) {
	const trimmed = stripHtmlCodeFences(html)
	const csp =
		`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https: blob:; font-src data: https:; media-src data: blob:;">`
	const base = '<base target="_blank">'
	const hasDocument = /<html[\s>]/i.test(trimmed) || /<!doctype/i.test(trimmed)

	if (hasDocument) {
		let doc = trimmed
		if (!/<base\s/i.test(doc)) {
			if (/<head[\s>]/i.test(doc)) {
				doc = doc.replace(/<head([^>]*)>/i, `<head$1>${base}${csp}`)
			} else if (/<html[\s>]/i.test(doc)) {
				doc = doc.replace(/<html([^>]*)>/i, `<html$1><head>${base}${csp}</head>`)
			} else {
				doc = `${base}${csp}${doc}`
			}
		}
		return injectSnapshotAgent(doc)
	}

	return injectSnapshotAgent(
		`<!DOCTYPE html><html><head><meta charset="utf-8">${base}${csp}<title>${escapeHtml(title)}</title><style>${DEFAULT_PREVIEW_CSS}</style></head><body>${trimmed}</body></html>`
	)
}

function injectSnapshotAgent(doc: string) {
	if (doc.includes('data-tldraw-snapshot')) return doc
	const tag = snapshotAgentTag()
	if (/<\/body>/i.test(doc)) return doc.replace(/<\/body>/i, `${tag}</body>`)
	return `${doc}${tag}`
}
