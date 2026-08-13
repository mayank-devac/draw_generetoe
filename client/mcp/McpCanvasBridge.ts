import { Box, FileHelpers, TLShape } from 'tldraw'
import { AgentHelpers } from '../../shared/AgentHelpers'
import { convertTldrawShapeToSimpleShape } from '../../shared/format/convertTldrawShapeToSimpleShape'
import {
	ApplyCanvasChangesInput,
	ApplyCanvasChangesInputSchema,
	CanvasApplyResult,
	CanvasReadResult,
	CanvasToServerMessage,
	CanvasUndoResult,
	MCP_CANVAS_URL,
	ReadCanvasInputSchema,
	ServerToCanvasMessage,
	UndoLastAiChangeInputSchema,
} from '../../shared/mcp/protocol'
import { AgentAction } from '../../shared/types/AgentAction'
import { Streaming } from '../../shared/types/Streaming'
import { TldrawAgent } from '../agent/TldrawAgent'

const CONNECT_PREFERENCE_KEY = 'tldraw:mcp-connect-canvas'
const RECONNECT_DELAY_MS = 2_000

export type McpCanvasStatus =
	| 'bridge-offline'
	| 'disconnected'
	| 'waiting'
	| 'connected'
	| 'drawing'
	| 'busy'
	| 'error'

export interface McpCanvasBridgeState {
	status: McpCanvasStatus
	assistantConnected: boolean
	undoAvailable: boolean
	detail?: string
}

class CanvasOperationError extends Error {
	constructor(
		readonly code: string,
		message: string
	) {
		super(message)
	}
}

export class McpCanvasBridge {
	private socket: WebSocket | null = null
	private reconnectTimer: number | null = null
	private initialConnectTimer: number | null = null
	private listeners = new Set<(state: McpCanvasBridgeState) => void>()
	private shouldConnect = localStorage.getItem(CONNECT_PREFERENCE_KEY) === 'true'
	private isApplyingMcp = false
	private started = false
	private state: McpCanvasBridgeState = {
		status: this.shouldConnect ? 'bridge-offline' : 'disconnected',
		assistantConnected: false,
		undoAvailable: false,
	}
	private stopDocumentListener: () => void = () => undefined

	constructor(private agent: TldrawAgent) {}

	setAgent(agent: TldrawAgent) {
		if (this.agent === agent) return
		this.stopDocumentListener()
		this.agent = agent
		if (this.started) this.startDocumentListener()
	}

	start() {
		if (this.started) return
		this.started = true
		this.startDocumentListener()

		if (this.shouldConnect) {
			this.initialConnectTimer = window.setTimeout(() => {
				this.initialConnectTimer = null
				this.openSocket()
			}, 100)
		}
	}

	private startDocumentListener() {
		this.stopDocumentListener = this.agent.editor.store.listen(
			() => {
				if (this.isApplyingMcp || !this.state.undoAvailable) return
				this.updateState({ undoAvailable: false })
			},
			{ scope: 'document', source: 'all' }
		)
	}

	getState() {
		return this.state
	}

	subscribe(listener: (state: McpCanvasBridgeState) => void) {
		this.listeners.add(listener)
		listener(this.state)
		return () => this.listeners.delete(listener)
	}

	connect() {
		this.shouldConnect = true
		localStorage.setItem(CONNECT_PREFERENCE_KEY, 'true')
		this.updateState({ status: 'bridge-offline', detail: 'Connecting to the local bridge…' })
		this.openSocket()
	}

	disconnect() {
		this.shouldConnect = false
		localStorage.setItem(CONNECT_PREFERENCE_KEY, 'false')
		this.clearReconnectTimer()
		const socket = this.socket
		this.socket = null
		socket?.close(1000, 'Canvas disconnected by user')
		this.updateState({
			status: 'disconnected',
			assistantConnected: false,
			detail: undefined,
		})
	}

	async undoFromUi() {
		try {
			this.updateState({ status: 'drawing', detail: 'Undoing the latest MCP change…' })
			await this.undoLastAiChange()
			this.restoreConnectedStatus()
		} catch (error) {
			this.setErrorState(error)
		}
	}

	dispose() {
		this.started = false
		if (this.initialConnectTimer) {
			window.clearTimeout(this.initialConnectTimer)
			this.initialConnectTimer = null
		}
		this.clearReconnectTimer()
		this.stopDocumentListener()
		this.stopDocumentListener = () => undefined
		this.socket?.close(1000, 'Canvas bridge disposed')
		this.socket = null
		this.listeners.clear()
	}

	private openSocket() {
		if (!this.started || !this.shouldConnect) return
		if (
			this.socket?.readyState === WebSocket.OPEN ||
			this.socket?.readyState === WebSocket.CONNECTING
		) {
			return
		}

		this.clearReconnectTimer()
		const socket = new WebSocket(MCP_CANVAS_URL)
		this.socket = socket

		socket.addEventListener('open', () => {
			if (this.socket !== socket) return
			this.send({ type: 'hello', version: 1 })
			this.updateState({
				status: 'waiting',
				assistantConnected: false,
				detail: undefined,
			})
		})

		socket.addEventListener('message', (event) => {
			void this.handleMessage(String(event.data))
		})

		socket.addEventListener('close', (event) => {
			if (this.socket !== socket) return
			this.socket = null
			if (!this.shouldConnect) return
			if (event.reason === 'CANVAS_REPLACED') {
				this.updateState({
					status: 'bridge-offline',
					assistantConnected: false,
					detail: 'A newer local canvas connection replaced this one.',
				})
				return
			}
			const detail =
				event.reason === 'CANVAS_ALREADY_CONNECTED'
					? 'Another browser canvas is already connected.'
					: 'Start the bridge with npm run dev.'
			this.updateState({ status: 'bridge-offline', assistantConnected: false, detail })
			this.scheduleReconnect()
		})

		socket.addEventListener('error', () => {
			if (this.socket !== socket || !this.shouldConnect) return
			this.updateState({
				status: 'bridge-offline',
				assistantConnected: false,
				detail: 'The local bridge is not reachable on port 3001.',
			})
		})
	}

	private async handleMessage(raw: string) {
		let message: ServerToCanvasMessage
		try {
			message = JSON.parse(raw) as ServerToCanvasMessage
		} catch {
			this.socket?.close(1007, 'INVALID_JSON')
			return
		}

		if (message.type === 'status') {
			this.updateState({
				assistantConnected: message.assistantConnected,
				status: message.assistantConnected ? 'connected' : 'waiting',
				detail: undefined,
			})
			return
		}

		if (message.type !== 'request') {
			this.socket?.close(1007, 'INVALID_MESSAGE')
			return
		}

		try {
			if (message.method !== 'read_canvas') {
				this.updateState({
					status: 'drawing',
					detail:
						message.method === 'undo_last_ai_change'
							? 'Undoing the latest MCP change…'
							: 'Applying an MCP drawing batch…',
				})
			}

			let result: unknown
			switch (message.method) {
				case 'read_canvas':
					result = await this.readCanvas(message.payload)
					break
				case 'apply_canvas_changes':
					result = await this.applyCanvasChanges(message.payload)
					break
				case 'undo_last_ai_change':
					UndoLastAiChangeInputSchema.parse(message.payload)
					result = await this.undoLastAiChange()
					break
			}

			this.send({ type: 'response', id: message.id, result })
			this.restoreConnectedStatus()
		} catch (error) {
			const operationError = normalizeOperationError(error)
			if (operationError.code === 'CANVAS_BUSY') {
				this.updateState({ status: 'busy', detail: operationError.message })
			} else {
				this.setErrorState(operationError)
			}
			this.send({
				type: 'response',
				id: message.id,
				error: { code: operationError.code, message: operationError.message },
			})
		}
	}

	private async readCanvas(payload: unknown): Promise<CanvasReadResult> {
		const { includeImage } = ReadCanvasInputSchema.parse(payload)
		const { editor } = this.agent
		const viewport = editor.getViewportPageBounds()
		const sortedShapes = editor.getCurrentPageShapesSorted()
		const shapes = sortedShapes.map((shape) => {
			const simpleShape = convertTldrawShapeToSimpleShape(editor, shape)
			if (simpleShape._type !== 'arrow') return simpleShape
			return {
				...simpleShape,
				fromId: simpleShape.fromId ? simpleId(simpleShape.fromId) : null,
				toId: simpleShape.toId ? simpleId(simpleShape.toId) : null,
			}
		})
		const result: CanvasReadResult = {
			connected: true,
			shapes,
			selectedShapeIds: editor
				.getSelectedShapeIds()
				.map((id) => id.replace(/^shape:/, '')),
			viewport: { x: viewport.x, y: viewport.y, w: viewport.w, h: viewport.h },
		}

		if (!includeImage) return result

		const viewportBox = Box.From(viewport)
		const visibleShapes = sortedShapes.filter((shape) => {
			const bounds = editor.getShapeMaskedPageBounds(shape)
			return bounds ? viewportBox.collides(bounds) : false
		})
		if (visibleShapes.length === 0) return result

		const largestDimension = Math.max(viewport.w, viewport.h)
		const scale = largestDimension > 2_000 ? 2_000 / largestDimension : 1
		const image = await editor.toImage(visibleShapes, {
			format: 'jpeg',
			background: true,
			bounds: viewportBox,
			padding: 0,
			pixelRatio: 1,
			scale,
		})
		result.imageDataUrl = await FileHelpers.blobToDataUrl(image.blob)
		return result
	}

	private async applyCanvasChanges(payload: unknown): Promise<CanvasApplyResult> {
		if (this.agent.isGenerating()) {
			throw new CanvasOperationError(
				'CANVAS_BUSY',
				'The in-app API agent is generating. Wait for it to finish, then retry the MCP write.'
			)
		}

		const input = ApplyCanvasChangesInputSchema.parse(payload)
		return this.applyValidatedBatch(input)
	}

	private async applyValidatedBatch(input: ApplyCanvasChangesInput): Promise<CanvasApplyResult> {
		const { editor } = this.agent
		const beforeShapes = new Map(
			editor.getCurrentPageShapes().map((shape) => [shape.id, JSON.stringify(shape)] as const)
		)
		const markId = editor.markHistoryStoppingPoint(`MCP: ${input.summary}`)
		const helpers = new AgentHelpers(this.agent)
		helpers.offset = { x: 0, y: 0 }
		const warnings: string[] = []

		this.updateState({ undoAvailable: false })
		this.isApplyingMcp = true
		try {
			for (const wireAction of input.actions) {
				const util = this.agent.getAgentActionUtil(wireAction._type)
				if (util === this.agent.unknownActionUtil) {
					throw new CanvasOperationError(
						'VALIDATION_ERROR',
						`Unknown canvas action: ${wireAction._type}`
					)
				}

				const schema = util.getSchema()
				if (!schema) {
					throw new CanvasOperationError(
						'VALIDATION_ERROR',
						`Canvas action ${wireAction._type} has no validation schema.`
					)
				}

				const enrichedAction =
					wireAction._type === 'clear'
						? wireAction
						: { ...wireAction, intent: wireAction.intent ?? input.summary }
				const parsed = schema.safeParse(enrichedAction)
				if (!parsed.success) {
					throw new CanvasOperationError(
						'VALIDATION_ERROR',
						`${wireAction._type}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`
					)
				}

				const completedAction = {
					...parsed.data,
					complete: true,
					time: 0,
				} as Streaming<AgentAction>
				const originalIdCount =
					'shapeIds' in completedAction && Array.isArray(completedAction.shapeIds)
						? completedAction.shapeIds.length
						: undefined
				const requestedCreateId =
					wireAction._type === 'create' ? wireAction.shape.shapeId : undefined
				const sanitized = util.sanitizeAction(structuredClone(completedAction), helpers)
				if (!sanitized) {
					throw new CanvasOperationError(
						'VALIDATION_ERROR',
						`${wireAction._type} references a shape that does not exist.`
					)
				}

				if (
					originalIdCount !== undefined &&
					'shapeIds' in sanitized &&
					Array.isArray(sanitized.shapeIds) &&
					sanitized.shapeIds.length !== originalIdCount
				) {
					throw new CanvasOperationError(
						'VALIDATION_ERROR',
						`${wireAction._type} references one or more shapes that do not exist.`
					)
				}

				if (
					requestedCreateId &&
					sanitized._type === 'create' &&
					sanitized.complete &&
					sanitized.shape.shapeId !== requestedCreateId
				) {
					warnings.push(
						`Shape ID ${requestedCreateId} already existed and was created as ${sanitized.shape.shapeId}.`
					)
				}

				const { promise } = this.agent.act(sanitized, helpers, { recordChatHistory: false })
				if (promise) await promise
			}

			editor.squashToMark(markId)
			// tldraw publishes the document-store event just after the editor transaction.
			// Keep this batch marked as MCP-owned until that event has been delivered.
			await new Promise<void>((resolve) => window.setTimeout(resolve, 250))
		} catch (error) {
			editor.bailToMark(markId)
			throw error
		} finally {
			this.isApplyingMcp = false
		}

		const afterShapes = new Map(
			editor.getCurrentPageShapes().map((shape) => [shape.id, JSON.stringify(shape)] as const)
		)
		const createdShapeIds = [...afterShapes.keys()]
			.filter((id) => !beforeShapes.has(id))
			.map(simpleId)
		const deletedShapeIds = [...beforeShapes.keys()]
			.filter((id) => !afterShapes.has(id))
			.map(simpleId)
		const changedShapeIds = [...afterShapes.keys()]
			.filter(
				(id) => beforeShapes.has(id) && beforeShapes.get(id) !== afterShapes.get(id)
			)
			.map(simpleId)
		const undoAvailable =
			createdShapeIds.length + deletedShapeIds.length + changedShapeIds.length > 0
		if (!undoAvailable) warnings.push('The batch completed but did not change any document shapes.')
		this.updateState({ undoAvailable })

		return {
			createdShapeIds,
			changedShapeIds,
			deletedShapeIds,
			warnings,
			undoAvailable,
		}
	}

	private async undoLastAiChange(): Promise<CanvasUndoResult> {
		if (this.agent.isGenerating()) {
			throw new CanvasOperationError(
				'CANVAS_BUSY',
				'The in-app API agent is generating. Wait for it to finish before undoing.'
			)
		}
		if (!this.state.undoAvailable) {
			return {
				undone: false,
				message:
					'The latest MCP batch is no longer safely undoable because there is no MCP batch or a later document edit occurred.',
				undoAvailable: false,
			}
		}

		this.isApplyingMcp = true
		try {
			this.agent.editor.undo()
			this.updateState({ undoAvailable: false })
		} finally {
			this.isApplyingMcp = false
		}

		return {
			undone: true,
			message: 'The latest MCP canvas batch was undone.',
			undoAvailable: false,
		}
	}

	private send(message: CanvasToServerMessage) {
		if (this.socket?.readyState !== WebSocket.OPEN) return
		this.socket.send(JSON.stringify(message))
	}

	private restoreConnectedStatus() {
		this.updateState({
			status: this.state.assistantConnected ? 'connected' : 'waiting',
			detail: undefined,
		})
	}

	private setErrorState(error: unknown) {
		const operationError = normalizeOperationError(error)
		this.updateState({
			status: 'error',
			detail: `${operationError.code}: ${operationError.message}`,
		})
	}

	private updateState(patch: Partial<McpCanvasBridgeState>) {
		this.state = { ...this.state, ...patch }
		for (const listener of this.listeners) listener(this.state)
	}

	private scheduleReconnect() {
		if (this.reconnectTimer || !this.shouldConnect || !this.started) return
		this.reconnectTimer = window.setTimeout(() => {
			this.reconnectTimer = null
			this.openSocket()
		}, RECONNECT_DELAY_MS)
	}

	private clearReconnectTimer() {
		if (!this.reconnectTimer) return
		window.clearTimeout(this.reconnectTimer)
		this.reconnectTimer = null
	}
}

let canvasBridgeSingleton: McpCanvasBridge | null = null

export function getMcpCanvasBridge(agent: TldrawAgent) {
	if (!canvasBridgeSingleton) canvasBridgeSingleton = new McpCanvasBridge(agent)
	canvasBridgeSingleton.setAgent(agent)
	return canvasBridgeSingleton
}

function simpleId(shapeOrId: TLShape | string) {
	const id = typeof shapeOrId === 'string' ? shapeOrId : shapeOrId.id
	return id.replace(/^shape:/, '')
}

function normalizeOperationError(error: unknown) {
	if (error instanceof CanvasOperationError) return error
	if (error instanceof Error && error.name === 'ZodError') {
		return new CanvasOperationError('VALIDATION_ERROR', error.message)
	}
	return new CanvasOperationError(
		'CANVAS_ERROR',
		error instanceof Error ? error.message : 'Unknown canvas error'
	)
}
