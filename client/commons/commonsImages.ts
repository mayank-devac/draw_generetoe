const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php'

// Replace this local identifier with the published project URL before deployment.
const API_USER_AGENT = 'DrawGeneretoe/0.1 (local development)'
const RESULT_LIMIT = 6
const SEARCH_PAGE_SIZE = 10
const MAX_SEARCH_PAGES = 3
const REQUEST_SPACING_MS = 250
const CACHE_TTL_MS = 5 * 60 * 1000

const METADATA_FIELDS = [
	'Artist',
	'AttributionRequired',
	'Copyrighted',
	'Credit',
	'DeletionReason',
	'ImageDescription',
	'License',
	'LicenseShortName',
	'LicenseUrl',
	'NonFree',
	'Permission',
	'Restrictions',
	'UsageTerms',
].join('|')

const EXPLICIT_REUSE_WARNING = /\b(do not use|not for reuse|permission required|no permission|not public domain)\b/i

export interface CommonsImageCandidate {
	pageId: number
	title: string
	caption: string
	thumbnailUrl: string
	thumbnailWidth: number
	thumbnailHeight: number
	originalWidth: number
	originalHeight: number
	mimeType: string
	artist: string
	credit: string
	licenseName: 'CC0' | 'Public domain'
	licenseCode: string
	licenseUrl: string
	descriptionUrl: string
}

interface MetadataValue {
	value?: string
}

interface CommonsImageInfo {
	width?: number
	height?: number
	thumburl?: string
	thumbwidth?: number
	thumbheight?: number
	thumbmime?: string
	mime?: string
	mediatype?: string
	descriptionurl?: string
	extmetadata?: Record<string, MetadataValue>
}

interface CommonsPage {
	pageid?: number
	title?: string
	index?: number
	imageinfo?: CommonsImageInfo[]
}

interface CommonsApiResponse {
	continue?: { gsroffset?: number }
	query?: { pages?: CommonsPage[] }
	error?: { code?: string; info?: string }
}

interface SearchCacheEntry {
	expiresAt: number
	results: CommonsImageCandidate[]
}

const searchCache = new Map<string, SearchCacheEntry>()

export async function searchCommonsImages(query: string, signal?: AbortSignal) {
	const normalizedQuery = query.trim().replace(/\s+/g, ' ')
	if (normalizedQuery.length < 2 || normalizedQuery.length > 80) {
		throw new Error('Commons image queries must contain 2–80 characters.')
	}

	throwIfAborted(signal)
	const cacheKey = normalizedQuery.toLocaleLowerCase()
	const cached = searchCache.get(cacheKey)
	if (cached && cached.expiresAt > Date.now()) {
		return cached.results.map((result) => ({ ...result }))
	}

	const results: CommonsImageCandidate[] = []
	const seenPageIds = new Set<number>()
	let searchOffset: number | undefined

	for (let pageNumber = 0; pageNumber < MAX_SEARCH_PAGES; pageNumber++) {
		if (pageNumber > 0) await abortableDelay(REQUEST_SPACING_MS, signal)

		const params = createBaseParams()
		params.set('generator', 'search')
		params.set('gsrsearch', normalizedQuery)
		params.set('gsrnamespace', '6')
		params.set('gsrlimit', String(SEARCH_PAGE_SIZE))
		if (searchOffset !== undefined) params.set('gsroffset', String(searchOffset))
		addImageInfoParams(params, 330)

		const response = await fetchCommons(params, signal)
		const pages = [...(response.query?.pages ?? [])].sort(
			(a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER)
		)

		for (const page of pages) {
			const candidate = parseCommonsCandidate(page)
			if (!candidate || seenPageIds.has(candidate.pageId)) continue
			seenPageIds.add(candidate.pageId)
			results.push(candidate)
			if (results.length === RESULT_LIMIT) break
		}

		if (results.length === RESULT_LIMIT) break
		searchOffset = response.continue?.gsroffset
		if (searchOffset === undefined) break
	}

	searchCache.set(cacheKey, {
		expiresAt: Date.now() + CACHE_TTL_MS,
		results: results.map((result) => ({ ...result })),
	})

	return results
}

export async function getVerifiedCommonsImage(pageId: number, signal?: AbortSignal) {
	if (!Number.isInteger(pageId) || pageId <= 0) {
		throw new Error('Commons pageId must be a positive integer.')
	}

	const params = createBaseParams()
	params.set('pageids', String(pageId))
	addImageInfoParams(params, 1280)

	const response = await fetchCommons(params, signal)
	const page = response.query?.pages?.[0]
	const candidate = page ? parseCommonsCandidate(page) : null
	if (!candidate) {
		throw new Error('The Commons file is missing verified CC0/public-domain metadata or has reuse restrictions.')
	}

	return candidate
}

function createBaseParams() {
	return new URLSearchParams({
		action: 'query',
		format: 'json',
		formatversion: '2',
		origin: '*',
		prop: 'imageinfo',
	})
}

function addImageInfoParams(params: URLSearchParams, thumbnailWidth: number) {
	params.set('iiprop', 'url|size|mime|thumbmime|mediatype|extmetadata')
	params.set('iiurlwidth', String(thumbnailWidth))
	params.set('iiextmetadatalanguage', 'en')
	params.set('iiextmetadatafilter', METADATA_FIELDS)
}

async function fetchCommons(params: URLSearchParams, signal?: AbortSignal) {
	throwIfAborted(signal)
	const response = await fetch(`${COMMONS_API_URL}?${params}`, {
		headers: { 'Api-User-Agent': API_USER_AGENT },
		signal,
	})

	if (!response.ok) {
		const retryAfter = response.headers.get('Retry-After')
		const retryMessage = retryAfter ? ` Retry after ${retryAfter} seconds.` : ''
		throw new Error(`Wikimedia Commons returned ${response.status}.${retryMessage}`)
	}

	const data = (await response.json()) as CommonsApiResponse
	if (data.error) {
		throw new Error(data.error.info || data.error.code || 'Wikimedia Commons rejected the request.')
	}
	return data
}

function parseCommonsCandidate(page: CommonsPage): CommonsImageCandidate | null {
	const pageId = page.pageid
	const info = page.imageinfo?.[0]
	const metadata = info?.extmetadata
	if (!pageId || !page.title || !info || !metadata) return null
	if (info.mediatype !== 'BITMAP' && info.mediatype !== 'DRAWING') return null

	const licenseShortName = metadataText(metadata, 'LicenseShortName')
	const licenseCode = metadataText(metadata, 'License').toLocaleLowerCase()
	const isCc0 = licenseShortName === 'CC0' && licenseCode === 'cc0'
	const isPublicDomain = licenseShortName === 'Public domain' && licenseCode.startsWith('pd')
	if (!isCc0 && !isPublicDomain) return null

	if (metadataBoolean(metadata, 'AttributionRequired') !== false) return null
	if (isPublicDomain && metadataBoolean(metadata, 'Copyrighted') !== false) return null
	if (metadataBoolean(metadata, 'NonFree') === true) return null
	if (!Object.prototype.hasOwnProperty.call(metadata, 'Restrictions')) return null
	if (metadataText(metadata, 'Restrictions')) return null
	if (metadataText(metadata, 'DeletionReason')) return null

	const permissionText = `${metadataText(metadata, 'Permission')} ${metadataText(metadata, 'Credit')}`
	if (EXPLICIT_REUSE_WARNING.test(permissionText)) return null

	const thumbnailUrl = validUrl(info.thumburl, 'upload.wikimedia.org')
	const descriptionUrl = validUrl(info.descriptionurl, 'commons.wikimedia.org')
	const licenseUrl = normalizeLicenseUrl(metadataText(metadata, 'LicenseUrl')) || descriptionUrl
	const thumbnailWidth = positiveNumber(info.thumbwidth)
	const thumbnailHeight = positiveNumber(info.thumbheight)
	const originalWidth = positiveNumber(info.width)
	const originalHeight = positiveNumber(info.height)
	const mimeType = info.thumbmime || info.mime || ''
	if (
		!thumbnailUrl ||
		!descriptionUrl ||
		!licenseUrl ||
		!thumbnailWidth ||
		!thumbnailHeight ||
		!originalWidth ||
		!originalHeight ||
		!mimeType.startsWith('image/')
	) {
		return null
	}

	const fallbackTitle = page.title.replace(/^File:/, '')
	return {
		pageId,
		title: fallbackTitle,
		caption: metadataText(metadata, 'ImageDescription') || fallbackTitle,
		thumbnailUrl,
		thumbnailWidth,
		thumbnailHeight,
		originalWidth,
		originalHeight,
		mimeType,
		artist: metadataText(metadata, 'Artist') || 'Unknown creator',
		credit: metadataText(metadata, 'Credit') || 'Wikimedia Commons',
		licenseName: isCc0 ? 'CC0' : 'Public domain',
		licenseCode,
		licenseUrl,
		descriptionUrl,
	}
}

function metadataText(metadata: Record<string, MetadataValue>, key: string) {
	return htmlToPlainText(metadata[key]?.value ?? '')
}

function metadataBoolean(metadata: Record<string, MetadataValue>, key: string) {
	const value = metadataText(metadata, key).toLocaleLowerCase()
	if (value === 'true') return true
	if (value === 'false') return false
	return null
}

function htmlToPlainText(value: string) {
	if (!value) return ''
	const document = new DOMParser().parseFromString(value, 'text/html')
	return (document.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function validUrl(value: string | undefined, expectedHost: string) {
	if (!value) return null
	try {
		const url = new URL(value)
		if (url.protocol !== 'https:' || url.hostname !== expectedHost) return null
		return url.toString()
	} catch {
		return null
	}
}

function normalizeLicenseUrl(value: string) {
	if (!value) return null
	try {
		const url = new URL(value)
		if (url.protocol === 'http:') url.protocol = 'https:'
		return url.protocol === 'https:' ? url.toString() : null
	} catch {
		return null
	}
}

function positiveNumber(value: number | undefined) {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function throwIfAborted(signal?: AbortSignal) {
	if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
}

function abortableDelay(milliseconds: number, signal?: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		const onAbort = () => {
			window.clearTimeout(timeout)
			signal?.removeEventListener('abort', onAbort)
			reject(new DOMException('The operation was aborted.', 'AbortError'))
		}
		const timeout = window.setTimeout(() => {
			signal?.removeEventListener('abort', onAbort)
			resolve()
		}, milliseconds)
		if (!signal) return
		signal.addEventListener('abort', onAbort, { once: true })
	})
}
