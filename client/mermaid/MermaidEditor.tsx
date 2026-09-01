import { useEffect, useRef, useState } from 'react'
import {
	CenteredTopPanelContainer,
	TLShapeId,
	TldrawUiButton,
	useEditor,
	useValue,
} from 'tldraw'
import { MermaidShape } from './MermaidShapeUtil'
import {
	addMermaidPreviewToCanvas,
	closeMermaidEditor,
	formatMermaidError,
	MERMAID_SHAPE_TYPE,
	mermaidEditorState,
	openMermaidEditor,
	previewMermaidDiagram,
	renderMermaidSource,
	svgToDataUrl,
	updatePendingMermaidPreview,
} from './mermaidDiagram'

export function MermaidPanelToggle() {
	const editor = useEditor()
	const panelState = useValue(mermaidEditorState)
	const currentPageId = useValue('current page id for Mermaid toggle', () => editor.getCurrentPageId(), [editor])
	const pending = panelState.pending?.pageId === currentPageId ? panelState.pending : null
	const target = useValue(
		'mermaid toggle target',
		() => findMermaidTarget(editor, panelState.shapeId),
		[editor, panelState.shapeId]
	)
	const disabled = !pending && !target && !panelState.isOpen
	const label = panelState.isOpen ? 'Close Mermaid preview' : 'Open Mermaid preview'

	return (
		<div className="tlui-style-panel__wrapper mermaid-toggle-wrap">
			<TldrawUiButton
				type="icon"
				className="mermaid-toggle"
				title={disabled ? 'No Mermaid preview or diagram on this page' : label}
				aria-label={disabled ? 'No Mermaid preview or diagram on this page' : label}
				disabled={disabled}
				onClick={() => {
					if (panelState.isOpen) closeMermaidEditor()
					else if (pending) mermaidEditorState.set({ ...panelState, isOpen: true })
					else if (target) openMermaidEditor(target.id)
				}}
			>
				<span aria-hidden="true" className="mermaid-toggle-icon">M</span>
			</TldrawUiButton>
		</div>
	)
}

export function MermaidEditorOverlay() {
	const editor = useEditor()
	const panelState = useValue(mermaidEditorState)
	const currentPageId = useValue('current page id for Mermaid preview', () => editor.getCurrentPageId(), [editor])
	const pending = panelState.pending?.pageId === currentPageId ? panelState.pending : null
	const shape = useValue(
		'mermaid editor shape',
		() => getMermaidShape(editor, panelState.shapeId),
		[editor, panelState.shapeId]
	)
	const selectedMermaid = useValue(
		'selected mermaid shape',
		() => editor.getSelectedShapes().find(isMermaidShape) ?? null,
		[editor]
	)
	const source = shape?.props.source ?? pending?.source ?? ''
	const svg = shape?.props.svg ?? pending?.svg ?? ''
	const activeKey = shape ? `shape:${shape.id}` : pending ? `pending:${pending.pageId}:${pending.shapeId}` : ''
	const [isEditing, setIsEditing] = useState(false)
	const [draft, setDraft] = useState('')
	const [previewSvg, setPreviewSvg] = useState('')
	const [diagramType, setDiagramType] = useState('')
	const [error, setError] = useState('')
	const [notice, setNotice] = useState('')
	const [rendering, setRendering] = useState(false)
	const renderGeneration = useRef(0)

	useEffect(() => {
		if (
			!panelState.isOpen ||
			pending ||
			!selectedMermaid ||
			selectedMermaid.id === panelState.shapeId
		) {
			return
		}
		openMermaidEditor(selectedMermaid.id)
	}, [panelState.isOpen, panelState.shapeId, pending, selectedMermaid])

	useEffect(() => {
		if (!panelState.isOpen || !activeKey) return
		setIsEditing(false)
		setDraft(source)
		setPreviewSvg(svg)
		setDiagramType(pending?.diagramType ?? '')
		setError('')
		setNotice('')
		setRendering(false)
	}, [activeKey, panelState.isOpen, source, svg, pending?.diagramType])

	useEffect(() => {
		if (!panelState.isOpen || !activeKey || !isEditing) return
		if (draft === source) {
			setPreviewSvg(svg)
			setDiagramType(pending?.diagramType ?? '')
			setError('')
			setRendering(false)
			return
		}

		const generation = ++renderGeneration.current
		setRendering(true)
		const timeout = window.setTimeout(() => {
			void renderMermaidSource(draft)
				.then((result) => {
					if (generation !== renderGeneration.current) return
					setPreviewSvg(result.svg)
					setDiagramType(result.diagramType)
					setError('')
				})
				.catch((nextError) => {
					if (generation !== renderGeneration.current) return
					setError(formatMermaidError(nextError))
				})
				.finally(() => {
					if (generation === renderGeneration.current) setRendering(false)
				})
		}, 350)

		return () => window.clearTimeout(timeout)
	}, [activeKey, draft, isEditing, panelState.isOpen, pending?.diagramType, source, svg])

	useEffect(() => {
		if (panelState.isOpen && !shape && !pending) closeMermaidEditor()
	}, [panelState.isOpen, pending, shape])

	// #region agent log
	useEffect(() => {
		const w = window as Window & { __debugOpenMermaidPreview?: () => Promise<unknown> }
		w.__debugOpenMermaidPreview = () =>
			previewMermaidDiagram(editor, {
				shapeId: 'debug-mermaid',
				source: 'flowchart LR\n  Idea --> Review\n  Review -->|Keep| Canvas\n  Review -->|Edit| Idea',
			})
		const describeDrag = (phase: string, event: DragEvent, hypothesisId: string) => {
			const target = event.target
			const el = target instanceof HTMLElement ? target : null
			const img = target instanceof HTMLImageElement ? target : null
			const url = (event.dataTransfer?.getData('text/uri-list') || event.dataTransfer?.getData('text/plain') || img?.src || '').slice(0, 80)
			fetch('http://127.0.0.1:7359/ingest/b7873e6d-6601-4395-87ad-d5018b4378d6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'19e42e'},body:JSON.stringify({sessionId:'19e42e',hypothesisId,location:'MermaidEditor.tsx:document-drag',message:phase,data:{tag:el?.tagName,className:el?.className,srcPrefix:img?.src?.slice(0,48),types:event.dataTransfer?Array.from(event.dataTransfer.types):[],urlPrefix:url,defaultPrevented:event.defaultPrevented,panelOpen:mermaidEditorState.get().isOpen},timestamp:Date.now()})}).catch(()=>{})
		}
		const onDragStart = (event: DragEvent) => describeDrag('document dragstart', event, 'A')
		const onDrop = (event: DragEvent) => describeDrag('document drop', event, 'D')
		document.addEventListener('dragstart', onDragStart, true)
		document.addEventListener('drop', onDrop, true)
		return () => {
			delete w.__debugOpenMermaidPreview
			document.removeEventListener('dragstart', onDragStart, true)
			document.removeEventListener('drop', onDrop, true)
		}
	}, [editor])
	// #endregion

	const canApply = Boolean(draft !== source && previewSvg && !error && !rendering)

	if (!panelState.isOpen || (!shape && !pending)) return null

	function cancelEditing() {
		setDraft(source)
		setPreviewSvg(svg)
		setError('')
		setRendering(false)
		setIsEditing(false)
	}

	function applyDraft() {
		if (!canApply) return
		const nextSource = draft.trim()
		if (shape) {
			editor.markHistoryStoppingPoint('editing Mermaid diagram')
			editor.updateShape<MermaidShape>({
				id: shape.id,
				type: MERMAID_SHAPE_TYPE,
				props: { source: nextSource, svg: previewSvg },
			})
		} else if (pending) {
			updatePendingMermaidPreview(nextSource, previewSvg, diagramType)
		}
		setIsEditing(false)
	}

	function addToCanvas() {
		if (!pending) return
		try {
			addMermaidPreviewToCanvas(editor, pending)
		} catch (nextError) {
			// #region agent log
			fetch('http://127.0.0.1:7359/ingest/b7873e6d-6601-4395-87ad-d5018b4378d6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'19e42e'},body:JSON.stringify({sessionId:'19e42e',hypothesisId:'D',location:'MermaidEditor.tsx:addToCanvas',message:'addToCanvas catch',data:{message:nextError instanceof Error ? nextError.message : String(nextError)},timestamp:Date.now()})}).catch(()=>{})
			// #endregion
			setNotice(nextError instanceof Error ? nextError.message : 'Could not add the diagram to the canvas.')
		}
	}

	function blockPreviewDrag(event: React.DragEvent) {
		event.preventDefault()
		event.stopPropagation()
		// #region agent log
		const img = event.target instanceof HTMLImageElement ? event.target : null
		fetch('http://127.0.0.1:7359/ingest/b7873e6d-6601-4395-87ad-d5018b4378d6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'19e42e'},body:JSON.stringify({sessionId:'19e42e',hypothesisId:'B',location:'MermaidEditor.tsx:blockPreviewDrag',message:'blockPreviewDrag fired',data:{tag:event.target instanceof HTMLElement ? event.target.tagName : typeof event.target,srcPrefix:img?.src?.slice(0,48),defaultPrevented:event.defaultPrevented},timestamp:Date.now()})}).catch(()=>{})
		// #endregion
		setNotice('Drag is not supported. Use Add to canvas.')
	}

	return (
		<CenteredTopPanelContainer maxWidth={760} marginBetweenZones={8}>
			<section
				className={`mermaid-editor-overlay${isEditing ? ' is-editing' : ''}`}
				aria-label="Mermaid diagram preview"
			>
				<div className="mermaid-editor-controls">
				{isEditing ? (
					<button type="button" onClick={cancelEditing}>Cancel</button>
				) : (
					<button type="button" onClick={() => setIsEditing(true)}>Edit</button>
				)}
				{pending && !isEditing ? (
					<button
						type="button"
						className="is-primary"
							onClick={addToCanvas}
					>
						Add to canvas
					</button>
				) : null}
				</div>
				{notice ? <div className="mermaid-editor-notice" role="status">{notice}</div> : null}
				<div className="mermaid-editor-grid">
				{isEditing ? (
					<div className="mermaid-editor-source">
						<label htmlFor="mermaid-source">Mermaid source</label>
						<textarea
							id="mermaid-source"
							value={draft}
							spellCheck={false}
							onChange={(event) => setDraft(event.target.value)}
						/>
						<div className="mermaid-editor-actions">
							<span className={error ? 'is-error' : ''}>
								{error || (rendering ? 'Rendering…' : '')}
							</span>
							<button type="button" disabled={!canApply} onClick={applyDraft}>Apply</button>
						</div>
					</div>
				) : null}
					<div className="mermaid-editor-preview" onDragStart={blockPreviewDrag}>
						{previewSvg ? (
							<img
								src={svgToDataUrl(previewSvg)}
								alt="Mermaid preview"
								draggable={false}
								onDragStart={blockPreviewDrag}
							/>
						) : null}
				</div>
			</div>
			</section>
		</CenteredTopPanelContainer>
	)
}

function getMermaidShape(editor: ReturnType<typeof useEditor>, shapeId: TLShapeId | null) {
	if (!shapeId) return null
	const shape = editor.getShape(shapeId)
	return shape &&
		isMermaidShape(shape) &&
		editor.getAncestorPageId(shape) === editor.getCurrentPageId()
		? shape
		: null
}

function findMermaidTarget(editor: ReturnType<typeof useEditor>, preferredId: TLShapeId | null) {
	const selected = editor.getSelectedShapes().find(isMermaidShape)
	if (selected) return selected
	const preferred = getMermaidShape(editor, preferredId)
	if (preferred) return preferred
	return [...editor.getCurrentPageShapesSorted()].reverse().find(isMermaidShape) ?? null
}

function isMermaidShape(shape: { type: string }): shape is MermaidShape {
	return shape.type === MERMAID_SHAPE_TYPE
}
