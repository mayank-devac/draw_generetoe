import {
	AssetRecordType,
	Editor,
	TLImageAsset,
	createShapeId,
	toRichText,
} from 'tldraw'
import { CommonsImageCandidate, getVerifiedCommonsImage } from './commonsImages'

const DEFAULT_MAX_WIDTH = 640
const DEFAULT_MAX_HEIGHT = 480
const MAX_WIDTH = 1600
const MAX_HEIGHT = 1200
const MAX_FALLBACK_BYTES = 5 * 1024 * 1024

export interface CommonsImagePlacement {
	pageId: number
	x: number
	y: number
	maxWidth?: number
	maxHeight?: number
}

export async function insertCommonsImage(
	editor: Editor,
	placement: CommonsImagePlacement,
	signal?: AbortSignal
) {
	const x = finiteCoordinate(placement.x, 'x')
	const y = finiteCoordinate(placement.y, 'y')
	const maxWidth = boundedSize(placement.maxWidth ?? DEFAULT_MAX_WIDTH, 'maxWidth', MAX_WIDTH)
	const maxHeight = boundedSize(placement.maxHeight ?? DEFAULT_MAX_HEIGHT, 'maxHeight', MAX_HEIGHT)

	const image = await getVerifiedCommonsImage(placement.pageId, signal)
	const source = await resolveImageSource(image, signal)
	const scale = Math.min(maxWidth / image.thumbnailWidth, maxHeight / image.thumbnailHeight, 1)
	const width = Math.round(image.thumbnailWidth * scale)
	const height = Math.round(image.thumbnailHeight * scale)
	const creditText = `Photo: ${image.artist} · ${image.licenseName} · Wikimedia Commons`

	const assetId = AssetRecordType.createId()
	const imageShapeId = createShapeId()
	const creditShapeId = createShapeId()
	const groupId = createShapeId()
	const provenance = createProvenance(image)

	const asset: TLImageAsset = {
		id: assetId,
		typeName: 'asset',
		type: 'image',
		props: {
			name: image.title,
			src: source,
			w: image.thumbnailWidth,
			h: image.thumbnailHeight,
			mimeType: image.mimeType,
			isAnimated: false,
		},
		meta: provenance,
	}

	editor.run(() => {
		editor.createAssets([asset])
		editor.createShapes([
			{
				id: imageShapeId,
				type: 'image',
				x,
				y,
				props: {
					assetId,
					w: width,
					h: height,
					altText: image.caption,
				},
				meta: provenance,
			},
			{
				id: creditShapeId,
				type: 'text',
				x,
				y: y + height + 8,
				props: {
					autoSize: false,
					color: 'grey',
					font: 'sans',
					richText: toRichText(creditText),
					scale: 0.75,
					size: 's',
					textAlign: 'start',
					w: width,
				},
				meta: provenance,
			},
		])
		editor.groupShapes([imageShapeId, creditShapeId], { groupId, select: true })
	})

	return {
		assetId,
		imageShapeId,
		creditShapeId,
		groupId,
		bounds: { x, y, w: width, h: height },
		creditText,
		source: provenance,
	}
}

function createProvenance(image: CommonsImageCandidate) {
	return {
		source: 'wikimedia-commons',
		commonsPageId: image.pageId,
		descriptionUrl: image.descriptionUrl,
		artist: image.artist,
		credit: image.credit,
		licenseName: image.licenseName,
		licenseCode: image.licenseCode,
		licenseUrl: image.licenseUrl,
		originalWidth: image.originalWidth,
		originalHeight: image.originalHeight,
		thumbnailWidth: image.thumbnailWidth,
		thumbnailHeight: image.thumbnailHeight,
	}
}

async function resolveImageSource(image: CommonsImageCandidate, signal?: AbortSignal) {
	try {
		await preloadImage(image.thumbnailUrl, signal)
		return image.thumbnailUrl
	} catch (error) {
		if (isAbortError(error)) throw error
	}

	const response = await fetch(image.thumbnailUrl, { signal })
	if (!response.ok) throw new Error(`The Commons thumbnail returned ${response.status}.`)

	const blob = await response.blob()
	if (!blob.type.startsWith('image/')) {
		throw new Error('The Commons thumbnail fallback did not return an image.')
	}
	if (blob.size > MAX_FALLBACK_BYTES) {
		throw new Error('The Commons thumbnail fallback is larger than 5 MiB.')
	}

	return blobToDataUrl(blob, signal)
}

function preloadImage(source: string, signal?: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException('The operation was aborted.', 'AbortError'))
			return
		}

		const image = new Image()
		image.crossOrigin = 'anonymous'
		const cleanup = () => signal?.removeEventListener('abort', onAbort)
		const onAbort = () => {
			image.src = ''
			cleanup()
			reject(new DOMException('The operation was aborted.', 'AbortError'))
		}

		image.onload = () => {
			cleanup()
			resolve()
		}
		image.onerror = () => {
			cleanup()
			reject(new Error('The remote Commons thumbnail could not be loaded.'))
		}
		signal?.addEventListener('abort', onAbort, { once: true })
		image.src = source
	})
}

function blobToDataUrl(blob: Blob, signal?: AbortSignal) {
	return new Promise<string>((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException('The operation was aborted.', 'AbortError'))
			return
		}

		const reader = new FileReader()
		const cleanup = () => signal?.removeEventListener('abort', onAbort)
		const onAbort = () => {
			reader.abort()
			cleanup()
			reject(new DOMException('The operation was aborted.', 'AbortError'))
		}

		reader.onload = () => {
			cleanup()
			if (typeof reader.result === 'string') resolve(reader.result)
			else reject(new Error('The Commons thumbnail fallback could not be encoded.'))
		}
		reader.onerror = () => {
			cleanup()
			reject(reader.error ?? new Error('The Commons thumbnail fallback could not be read.'))
		}
		signal?.addEventListener('abort', onAbort, { once: true })
		reader.readAsDataURL(blob)
	})
}

function finiteCoordinate(value: number, field: string) {
	if (!Number.isFinite(value)) throw new Error(`${field} must be a finite canvas coordinate.`)
	return value
}

function boundedSize(value: number, field: string, maximum: number) {
	if (!Number.isFinite(value) || value < 64 || value > maximum) {
		throw new Error(`${field} must be between 64 and ${maximum}.`)
	}
	return value
}

function isAbortError(error: unknown) {
	return error instanceof DOMException && error.name === 'AbortError'
}
