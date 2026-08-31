import {
	BaseBoxShapeUtil,
	HTMLContainer,
	RecordProps,
	T,
	TLBaseShape,
	toDomPrecision,
} from 'tldraw'
import {
	MERMAID_SHAPE_TYPE,
	MermaidShapeProps,
	openMermaidEditor,
	svgToDataUrl,
} from './mermaidDiagram'

export type MermaidShape = TLBaseShape<typeof MERMAID_SHAPE_TYPE, MermaidShapeProps>

export class MermaidShapeUtil extends BaseBoxShapeUtil<MermaidShape> {
	static override type = MERMAID_SHAPE_TYPE
	static override props: RecordProps<MermaidShape> = {
		w: T.nonZeroNumber,
		h: T.nonZeroNumber,
		title: T.string,
		source: T.string,
		svg: T.string,
	}

	override getDefaultProps(): MermaidShape['props'] {
		return { w: 720, h: 520, title: 'Mermaid diagram', source: '', svg: '' }
	}

	override canResize() {
		return true
	}

	override component(shape: MermaidShape) {
		return (
			<HTMLContainer className="mermaid-shape" id={shape.id}>
				<div className="mermaid-shape-title">{shape.props.title}</div>
				<div className="mermaid-shape-stage">
					<img
						src={svgToDataUrl(shape.props.svg)}
						alt={shape.props.title}
						draggable={false}
						onDragStart={(event) => {
							// #region agent log
							fetch('http://127.0.0.1:7359/ingest/b7873e6d-6601-4395-87ad-d5018b4378d6',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'19e42e'},body:JSON.stringify({sessionId:'19e42e',hypothesisId:'C',location:'MermaidShapeUtil.tsx:img',message:'canvas mermaid img dragstart',data:{srcPrefix:event.currentTarget.src.slice(0,48)},timestamp:Date.now()})}).catch(()=>{})
							// #endregion
						}}
					/>
				</div>
			</HTMLContainer>
		)
	}

	override indicator(shape: MermaidShape) {
		return (
			<rect
				width={toDomPrecision(shape.props.w)}
				height={toDomPrecision(shape.props.h)}
				rx={10}
				ry={10}
			/>
		)
	}

	override toSvg(shape: MermaidShape) {
		return (
			<image
				href={svgToDataUrl(shape.props.svg)}
				width={shape.props.w}
				height={shape.props.h}
				preserveAspectRatio="xMidYMid meet"
			/>
		)
	}

	override onDoubleClick(shape: MermaidShape) {
		openMermaidEditor(shape.id)
	}
}
