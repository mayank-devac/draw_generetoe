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
