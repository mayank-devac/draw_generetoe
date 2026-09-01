import { useEffect, useMemo, useState } from 'react'
import {
	DefaultSizeStyle,
	DefaultStylePanel,
	DefaultStylePanelContent,
	TLComponents,
	Tldraw,
	TldrawUiToastsProvider,
	TLUiOverrides,
	useEditor,
} from 'tldraw'
import { TldrawAgent } from './agent/TldrawAgent'
import { useTldrawAgent } from './agent/useTldrawAgent'
import { ChatPanel } from './components/ChatPanel'
import { ChevronRightIcon } from './components/icons/ChevronRightIcon'
import { CustomHelperButtons } from './components/CustomHelperButtons'
import { AgentViewportBoundsHighlight } from './components/highlights/AgentViewportBoundsHighlights'
import { ContextHighlights } from './components/highlights/ContextHighlights'
import { enableLinedFillStyle } from './enableLinedFillStyle'
import { MermaidEditorOverlay, MermaidPanelToggle } from './mermaid/MermaidEditor'
import './mermaid/mermaid.css'
import { customShapeUtils } from './shapes/customShapeUtils'
import { TargetAreaTool } from './tools/TargetAreaTool'
import { TargetShapeTool } from './tools/TargetShapeTool'
import { isJudgeMode } from './judgeMode'
import { registerWebMcpTools } from './webmcp/registerWebMcpTools'

/**
 * The ID used for this project's agent.
 * If you want to support multiple agents, you can use a different ID for each agent.
 */
export const AGENT_ID = 'agent-starter'

// Customize tldraw's styles to play to the agent's strengths
DefaultSizeStyle.setDefaultValue('s')
enableLinedFillStyle()

// Custom tools for picking context items
const tools = [TargetShapeTool, TargetAreaTool]
const overrides: TLUiOverrides = {
	tools: (editor, tools) => {
		return {
			...tools,
			'target-area': {
				id: 'target-area',
				label: 'Pick Area',
				kbd: 'c',
				icon: 'tool-frame',
				onSelect() {
					editor.setCurrentTool('target-area')
				},
			},
			'target-shape': {
				id: 'target-shape',
				label: 'Pick Shape',
				kbd: 's',
				icon: 'tool-frame',
				onSelect() {
					editor.setCurrentTool('target-shape')
				},
			},
		}
	},
}

function App() {
	const [agent, setAgent] = useState<TldrawAgent | undefined>()

	useEffect(() => {
		if (isJudgeMode) document.title = 'WebMCP Draw Canvas'
	}, [])

	// Custom components to visualize what the agent is doing
	const components: TLComponents = useMemo(() => {
		return {
			HelperButtons: () =>
				agent && !isJudgeMode ? <CustomHelperButtons agent={agent} /> : null,
			SharePanel: MermaidPanelToggle,
			StylePanel: CollapsibleStylePanel,
			TopPanel: MermaidEditorOverlay,
			InFrontOfTheCanvas: () =>
				!isJudgeMode && agent ? (
					<>
						<AgentViewportBoundsHighlight agent={agent} />
						<ContextHighlights agent={agent} />
					</>
				) : null,
		}
	}, [agent])

	return (
		<TldrawUiToastsProvider>
			<div className={`tldraw-agent-container${isJudgeMode ? ' is-judge-mode' : ''}`}>
				{isJudgeMode && <JudgeBanner />}
				<div className="tldraw-canvas">
					<Tldraw
						persistenceKey={isJudgeMode ? 'tldraw-webmcp-judge' : 'tldraw-agent-demo'}
						shapeUtils={customShapeUtils}
						tools={tools}
						overrides={overrides}
						components={components}
					>
						<AppInner setAgent={setAgent} />
					</Tldraw>
				</div>
				{agent && !isJudgeMode && <ChatPanel agent={agent} />}
			</div>
		</TldrawUiToastsProvider>
	)
}

function JudgeBanner() {
	return (
		<aside className="judge-banner" aria-label="WebMCP judge instructions">
			<strong>WebMCP demo.</strong> Enable{' '}
			<code>chrome://flags/#enable-webmcp-testing</code>, relaunch Chromium, then go to codex to use web mcp tools
		</aside>
	)
}

function CollapsibleStylePanel() {
	const [collapsed, setCollapsed] = useState(true)
	const label = collapsed ? 'Expand style panel' : 'Collapse style panel'
	const toggleButton = (
		<button
			type="button"
			className="style-panel-collapse-button"
			title={label}
			aria-label={label}
			aria-expanded={!collapsed}
			onClick={() => setCollapsed((value) => !value)}
		>
			<span className={`style-panel-collapse-icon${collapsed ? ' is-collapsed' : ''}`}>
				<ChevronRightIcon />
			</span>
		</button>
	)

	if (collapsed) {
		return <div className="tlui-style-panel__wrapper collapsible-style-panel is-collapsed">{toggleButton}</div>
	}

	return (
		<DefaultStylePanel>
			<div className="style-panel-collapse-row">{toggleButton}</div>
			<DefaultStylePanelContent />
		</DefaultStylePanel>
	)
}

function AppInner({ setAgent }: { setAgent: (agent: TldrawAgent) => void }) {
	const editor = useEditor()
	const agent = useTldrawAgent(editor, AGENT_ID)

	useEffect(() => {
		if (!editor || !agent) return
		setAgent(agent)
		;(window as any).editor = editor
		;(window as any).agent = agent
	}, [agent, editor, setAgent])

	useEffect(() => {
		if (!agent) return

		const controller = new AbortController()
		void registerWebMcpTools(agent, controller.signal)

		return () => controller.abort()
	}, [agent])

	return null
}

export default App
