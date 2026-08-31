import { Editor, EmbedShapeUtil, TLEmbedShape, TLShape } from 'tldraw'
import { convertTldrawIdToSimpleId } from '../../shared/format/convertTldrawShapeToSimpleShape'

export type EmbedInspection = {
	shapeId: string
	url: string
	embedUrl: string | null
	provider: string | null
	w: number
	h: number
}

export function inspectEmbeds(
	editor: Editor,
	input: { pageNumber?: number; shapeId?: string }
): {
	currentPageNumber: number
	pageNumber: number
	pageId: string
	count: number
	embeds: EmbedInspection[]
} {
	const pages = editor.getPages()
	const currentPageNumber = pages.findIndex((page) => page.id === editor.getCurrentPageId()) + 1
	const page =
		input.pageNumber === undefined ? editor.getPage(editor.getCurrentPageId()) : pages[input.pageNumber - 1]

	if (!page) {
		throw new Error(`Page number ${input.pageNumber} does not exist.`)
	}

	const util = editor.getShapeUtil('embed') as EmbedShapeUtil
	const embeds = [...editor.getPageShapeIds(page)]
		.map((shapeId) => editor.getShape(shapeId))
		.filter((shape): shape is TLEmbedShape => shape !== undefined && isEmbedShape(shape))
		.filter((shape) => input.shapeId === undefined || convertTldrawIdToSimpleId(shape.id) === input.shapeId)
		.map((shape) => {
			const matched = util.getEmbedDefinition(shape.props.url)
			return {
				shapeId: convertTldrawIdToSimpleId(shape.id),
				url: redactSensitiveQueryParameters(shape.props.url),
				embedUrl: matched ? redactSensitiveQueryParameters(matched.embedUrl) : null,
				provider: matched?.definition.title ?? null,
				w: shape.props.w,
				h: shape.props.h,
			}
		})
		.sort((a, b) => a.shapeId.localeCompare(b.shapeId))

	if (input.shapeId !== undefined && embeds.length === 0) {
		throw new Error('No embed shape matches that ID on the requested page.')
	}

	return {
		currentPageNumber,
		pageNumber: pages.findIndex((candidate) => candidate.id === page.id) + 1,
		pageId: page.id,
		count: embeds.length,
		embeds,
	}
}

function isEmbedShape(shape: TLShape): shape is TLEmbedShape {
	return shape.type === 'embed'
}

const SENSITIVE_QUERY_PARAMETER = /^(?:api[-_]?key|key|token|access[-_]?token|id[-_]?token|auth|authorization|signature|sig|secret|client[-_]?secret|password|passwd|credential|code|x-amz-(?:credential|signature|security-token)|x-goog-(?:credential|signature))$/i

export function redactSensitiveQueryParameters(rawUrl: string, depth = 0): string {
	try {
		const url = new URL(rawUrl)
		for (const [name, value] of [...url.searchParams.entries()]) {
			if (SENSITIVE_QUERY_PARAMETER.test(name)) {
				url.searchParams.set(name, '[REDACTED]')
				continue
			}

			if (depth < 2 && /^https?:\/\//i.test(value)) {
				url.searchParams.set(name, redactSensitiveQueryParameters(value, depth + 1))
			}
		}
		return url.toString()
	} catch {
		return rawUrl
	}
}
