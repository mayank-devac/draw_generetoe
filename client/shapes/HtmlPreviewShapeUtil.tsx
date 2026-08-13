import { useEffect, useMemo, useRef } from 'react'
import {
	BaseBoxShapeUtil,
	HTMLContainer,
	RecordProps,
	T,
	TLBaseShape,
	toDomPrecision,
	useIsEditing,
	useSvgExportContext,
	useValue,
} from 'tldraw'
import { HTML_PREVIEW_SHAPE_TYPE, wrapHtmlPreviewDocument } from '../../shared/format/htmlPreview'
import { requestIframeSnapshot } from '../lib/captureHtmlPreviewThumbnail'

export type HtmlPreviewShape = TLBaseShape<
	typeof HTML_PREVIEW_SHAPE_TYPE,
	{
		w: number
		h: number
		html: string
		title: string
		thumbnail: string
	}
>

export class HtmlPreviewShapeUtil extends BaseBoxShapeUtil<HtmlPreviewShape> {
	static override type = HTML_PREVIEW_SHAPE_TYPE
	static override props: RecordProps<HtmlPreviewShape> = {
		w: T.nonZeroNumber,
		h: T.nonZeroNumber,
		html: T.string,
		title: T.string,
		thumbnail: T.string,
	}

	override getDefaultProps(): HtmlPreviewShape['props'] {
		return {
			w: 640,
			h: 480,
			html: '',
			title: 'HTML view',
			thumbnail: '',
		}
	}

	override canEdit() {
		return true
	}

	override canEditInReadonly() {
		return true
	}

	override canResize() {
		return true
	}

	override hideSelectionBoundsFg() {
		return false
	}

	override component(shape: HtmlPreviewShape) {
		const svgExport = useSvgExportContext()
		const isEditing = useIsEditing(shape.id)
		const iframeRef = useRef<HTMLIFrameElement>(null)
		const { html, title, thumbnail } = shape.props
		const label = title || 'HTML view'

		const isHoveringWhileEditingSameShape = useValue(
			'html-preview hovering',
			() => {
				const { editingShapeId, hoveredShapeId } = this.editor.getCurrentPageState()
				if (editingShapeId && hoveredShapeId !== editingShapeId) {
					const editingShape = this.editor.getShape(editingShapeId)
					if (
						editingShape &&
						this.editor.isShapeOfType<HtmlPreviewShape>(editingShape, HTML_PREVIEW_SHAPE_TYPE)
					) {
						return true
					}
				}
				return false
			},
			[]
		)

		const isChatThumbnail = useValue(
			'html-preview chat thumbnail',
			() => Boolean(this.editor.getContainer()?.closest('.tldraw-viewer')),
			[]
		)

		const isInteractive = isEditing || isHoveringWhileEditingSameShape
		const srcDoc = useMemo(() => wrapHtmlPreviewDocument(html, label), [html, label])

		useEffect(() => {
			if (svgExport || isChatThumbnail || !html || thumbnail) return
			const frame = iframeRef.current
			if (!frame) return
			let cancelled = false

			const takeSnapshot = () => {
				void requestIframeSnapshot(frame).then((dataUrl) => {
					if (cancelled || !dataUrl) return
					const current = this.editor.getShape(shape.id)
					if (
						!current ||
						!this.editor.isShapeOfType<HtmlPreviewShape>(current, HTML_PREVIEW_SHAPE_TYPE)
					) {
						return
					}
					if (current.props.thumbnail) return
					this.editor.updateShape({
						id: shape.id,
						type: HTML_PREVIEW_SHAPE_TYPE,
						props: { thumbnail: dataUrl },
					})
				})
			}

			frame.addEventListener('load', takeSnapshot)
			return () => {
				cancelled = true
				frame.removeEventListener('load', takeSnapshot)
			}
		}, [html, thumbnail, svgExport, isChatThumbnail, shape.id])

		if (svgExport || isChatThumbnail) {
			return (
				<HTMLContainer className="html-preview-shape" id={shape.id}>
					<div className="html-preview-chrome">
						<span className="html-preview-dot" aria-hidden="true" />
						<span className="html-preview-title">{label}</span>
					</div>
					{thumbnail ? (
						<img className="html-preview-poster" src={thumbnail} alt="" />
					) : (
						<div className="html-preview-placeholder">HTML preview</div>
					)}
				</HTMLContainer>
			)
		}

		return (
			<HTMLContainer className="html-preview-shape" id={shape.id}>
				<div className="html-preview-chrome">
					<span className="html-preview-dot" aria-hidden="true" />
					<span className="html-preview-title">{label}</span>
					{isInteractive && (
						<button
							type="button"
							className="html-preview-stop"
							aria-label="Stop interacting"
							onPointerDown={(e) => {
								e.stopPropagation()
								this.editor.markEventAsHandled(e)
							}}
							onClick={(e) => {
								e.stopPropagation()
								this.editor.markEventAsHandled(e)
								this.editor.setEditingShape(null)
							}}
						>
							<StopIcon />
						</button>
					)}
				</div>
				<div className="html-preview-stage">
					<iframe
						ref={iframeRef}
						className="html-preview-iframe"
						srcDoc={srcDoc}
						sandbox="allow-scripts allow-forms"
						referrerPolicy="no-referrer"
						draggable={false}
						tabIndex={isInteractive ? 0 : -1}
						title={label}
						style={{
							pointerEvents: isInteractive ? 'auto' : 'none',
							zIndex: isInteractive ? 1 : -1,
						}}
					/>
					{!isInteractive && (
						<button
							type="button"
							className="html-preview-play"
							aria-label="Interact with preview"
							onPointerDown={(e) => {
								e.stopPropagation()
								this.editor.markEventAsHandled(e)
							}}
							onClick={(e) => {
								e.stopPropagation()
								this.editor.markEventAsHandled(e)
								this.editor.select(shape.id)
								this.editor.setEditingShape(shape.id)
							}}
						>
							<PlayIcon />
						</button>
					)}
				</div>
			</HTMLContainer>
		)
	}

	override indicator(shape: HtmlPreviewShape) {
		return (
			<rect
				width={toDomPrecision(shape.props.w)}
				height={toDomPrecision(shape.props.h)}
				rx={12}
				ry={12}
			/>
		)
	}
}

function PlayIcon() {
	return (
		<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M8 5.5v13l11-6.5-11-6.5z" />
		</svg>
	)
}

function StopIcon() {
	return (
		<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<rect x="6" y="6" width="12" height="12" rx="1.5" />
		</svg>
	)
}
