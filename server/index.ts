import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { createMcpExpressApp } from '@modelcontextprotocol/express'
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import { CallToolResult, isInitializeRequest, McpServer } from '@modelcontextprotocol/server'
import { WebSocket, WebSocketServer } from 'ws'
import {
	ApplyCanvasChangesInputSchema,
	CanvasToServerMessage,
	MCP_BRIDGE_PORT,
	MCP_CANVAS_PATH,
	ReadCanvasInputSchema,
	ServerToCanvasMessage,
	UndoLastAiChangeInputSchema,
} from '../shared/mcp/protocol'

const HOST = '127.0.0.1'
const REQUEST_TIMEOUT_MS = 30_000
const ALLOWED_CANVAS_ORIGINS = new Set(['http://127.0.0.1:5173', 'http://localhost:5173'])

class BridgeError extends Error {
	constructor(
		readonly code: string,
		message: string
	) {
		super(message)
	}
}

class CanvasBridge {
	private canvas: WebSocket | null = null
	private assistantConnected = false
	private pending = new Map<
		string,
		{
			resolve: (result: unknown) => void
			reject: (error: Error) => void
			timer: ReturnType<typeof setTimeout>
		}
	>()
	private writeTail: Promise<void> = Promise.resolve()

	attach(socket: WebSocket) {
		if (this.canvas?.readyState === WebSocket.OPEN) {
			// A page refresh can briefly overlap the old and new browser sockets.
			// The newest local canvas becomes authoritative; the old one is notified.
			this.canvas.close(1012, 'CANVAS_REPLACED')
		}

		this.canvas = socket
		socket.on('message', (data) => this.handleCanvasMessage(data.toString()))
		socket.on('close', () => {
			if (this.canvas !== socket) return
			this.canvas = null
			this.rejectPending(
				new BridgeError('CANVAS_NOT_CONNECTED', 'The tldraw canvas disconnected during the request.')
			)
		})
		socket.on('error', () => {
			if (this.canvas === socket) {
				this.rejectPending(new BridgeError('CANVAS_CONNECTION_ERROR', 'The canvas connection failed.'))
			}
		})

		this.send({ type: 'status', assistantConnected: this.assistantConnected })
		return true
	}

	setAssistantConnected(connected: boolean) {
		this.assistantConnected = connected
		this.send({ type: 'status', assistantConnected: connected })
	}

	isCanvasConnected() {
		return this.canvas?.readyState === WebSocket.OPEN
	}

	request(method: 'read_canvas' | 'apply_canvas_changes' | 'undo_last_ai_change', payload: unknown) {
		if (method === 'read_canvas') return this.sendRequest(method, payload)

		const run = () => this.sendRequest(method, payload)
		const result = this.writeTail.then(run, run)
		this.writeTail = result.then(
			() => undefined,
			() => undefined
		)
		return result
	}

	private sendRequest(method: 'read_canvas' | 'apply_canvas_changes' | 'undo_last_ai_change', payload: unknown) {
		if (!this.isCanvasConnected()) {
			return Promise.reject(
				new BridgeError(
					'CANVAS_NOT_CONNECTED',
					'No canvas is connected. Open the tldraw app and select Connect Canvas.'
				)
			)
		}

		const id = randomUUID()
		return new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id)
				reject(
					new BridgeError(
						'CANVAS_TIMEOUT',
						`The canvas did not answer ${method} within ${REQUEST_TIMEOUT_MS / 1_000} seconds.`
					)
				)
			}, REQUEST_TIMEOUT_MS)

			this.pending.set(id, { resolve, reject, timer })
			this.send({ type: 'request', id, method, payload })
		})
	}

	private send(message: ServerToCanvasMessage) {
		if (!this.canvas || this.canvas.readyState !== WebSocket.OPEN) return
		this.canvas.send(JSON.stringify(message))
	}

	private handleCanvasMessage(raw: string) {
		let message: CanvasToServerMessage
		try {
			message = JSON.parse(raw) as CanvasToServerMessage
		} catch {
			this.canvas?.close(1007, 'INVALID_JSON')
			return
		}

		if (message.type === 'hello') {
			if (message.version !== 1) this.canvas?.close(1002, 'UNSUPPORTED_BRIDGE_VERSION')
			return
		}

		if (message.type !== 'response' || typeof message.id !== 'string') {
			this.canvas?.close(1007, 'INVALID_MESSAGE')
			return
		}

		const request = this.pending.get(message.id)
		if (!request) return
		clearTimeout(request.timer)
		this.pending.delete(message.id)

		if (message.error) {
			request.reject(new BridgeError(message.error.code, message.error.message))
		} else {
			request.resolve(message.result)
		}
	}

	private rejectPending(error: Error) {
		for (const request of this.pending.values()) {
			clearTimeout(request.timer)
			request.reject(error)
		}
		this.pending.clear()
	}
}

const bridge = new CanvasBridge()

function toolError(error: unknown): CallToolResult {
	const code = error instanceof BridgeError ? error.code : 'CANVAS_ERROR'
	const message = error instanceof Error ? error.message : 'Unknown canvas error'
	return {
		isError: true,
		content: [{ type: 'text', text: `${code}: ${message}` }],
	}
}

function textAndStructured(structuredContent: Record<string, unknown>): CallToolResult {
	return {
		content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
		structuredContent,
	}
}

function createCanvasMcpServer() {
	const server = new McpServer(
		{ name: 'tldraw-canvas', version: '1.0.0' },
		{
			instructions:
				'Call read_canvas before making edits. Use absolute canvas coordinates. Combine related edits into one apply_canvas_changes batch so they are atomic and form one undo step. Call read_canvas again when visual verification is useful. Never assume a shape ID that was not returned by read_canvas or created earlier in the same batch.',
		}
	)

	server.registerTool(
		'read_canvas',
		{
			title: 'Read canvas',
			description:
				'Read the open tldraw canvas, including simplified shapes, selection, viewport, and an optional JPEG of visible shapes.',
			inputSchema: ReadCanvasInputSchema,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async (input) => {
			try {
				const result = (await bridge.request('read_canvas', input)) as Record<string, unknown>
				const { imageDataUrl, ...structuredContent } = result
				const content: CallToolResult['content'] = [
					{ type: 'text', text: JSON.stringify(structuredContent, null, 2) },
				]

				if (typeof imageDataUrl === 'string') {
					const match = /^data:(image\/jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl)
					if (match) content.push({ type: 'image', mimeType: match[1], data: match[2] })
				}

				return { content, structuredContent }
			} catch (error) {
				return toolError(error)
			}
		}
	)

	server.registerTool(
		'apply_canvas_changes',
		{
			title: 'Apply canvas changes',
			description:
				'Atomically create, update, label, move, resize, rotate, align, distribute, stack, reorder, draw, delete, or clear shapes. Related actions should be sent in one batch.',
			inputSchema: ApplyCanvasChangesInputSchema,
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		async (input) => {
			try {
				const result = (await bridge.request('apply_canvas_changes', input)) as Record<
					string,
					unknown
				>
				return textAndStructured(result)
			} catch (error) {
				return toolError(error)
			}
		}
	)

	server.registerTool(
		'undo_last_ai_change',
		{
			title: 'Undo last AI change',
			description:
				'Undo only the latest MCP canvas batch, if no later manual, in-app-agent, or MCP document edit has occurred.',
			inputSchema: UndoLastAiChangeInputSchema,
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		async () => {
			try {
				const result = (await bridge.request('undo_last_ai_change', {})) as Record<string, unknown>
				return textAndStructured(result)
			} catch (error) {
				return toolError(error)
			}
		}
	)

	return server
}

const app = createMcpExpressApp({
	host: HOST,
	allowedHosts: ['127.0.0.1', 'localhost'],
	allowedOrigins: ['127.0.0.1', 'localhost'],
	jsonLimit: '1mb',
})

const transports = new Map<string, NodeStreamableHTTPServerTransport>()
let initializing = false

function releaseSession(sessionId: string) {
	transports.delete(sessionId)
	if (transports.size === 0) bridge.setAssistantConnected(false)
}

app.get('/health', (_request, response) => {
	response.json({ ok: true, canvasConnected: bridge.isCanvasConnected(), assistantConnected: transports.size > 0 })
})

app.all('/mcp', async (request, response) => {
	try {
		const sessionId = request.header('mcp-session-id')
		if (sessionId) {
			const transport = transports.get(sessionId)
			if (!transport) {
				response.status(404).json({ error: 'MCP_SESSION_NOT_FOUND' })
				return
			}
			await transport.handleRequest(request, response, request.body)
			return
		}

		if (request.method === 'POST' && isInitializeRequest(request.body)) {
			if (initializing || transports.size > 0) {
				response.status(409).json({
					jsonrpc: '2.0',
					id: (request.body as { id?: unknown })?.id ?? null,
					error: {
						code: -32001,
						message:
							'ASSISTANT_ALREADY_CONNECTED: Another MCP assistant controls this canvas. Disconnect that client before connecting a new one.',
					},
				})
				return
			}

			initializing = true
			const transport = new NodeStreamableHTTPServerTransport({
				sessionIdGenerator: randomUUID,
				enableJsonResponse: true,
				onsessioninitialized: (newSessionId) => {
					transports.set(newSessionId, transport)
					initializing = false
					bridge.setAssistantConnected(true)
				},
				onsessionclosed: releaseSession,
			})

			const mcpServer = createCanvasMcpServer()
			await mcpServer.connect(transport)
			await transport.handleRequest(request, response, request.body)
			return
		}

		response.status(400).json({
			error: 'MCP_SESSION_REQUIRED',
			message: 'Send an MCP initialize request before other MCP requests.',
		})
	} catch (error) {
		initializing = false
		console.error('[MCP bridge] Request failed:', error)
		if (!response.headersSent) response.status(500).json({ error: 'MCP_INTERNAL_ERROR' })
	}
})

const httpServer = createServer(app)
const socketServer = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 })

httpServer.on('upgrade', (request, socket, head) => {
	const origin = request.headers.origin
	const host = request.headers.host?.split(':')[0]
	if (
		request.url !== MCP_CANVAS_PATH ||
		!origin ||
		!ALLOWED_CANVAS_ORIGINS.has(origin) ||
		(host !== '127.0.0.1' && host !== 'localhost')
	) {
		socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
		socket.destroy()
		return
	}

	socketServer.handleUpgrade(request, socket, head, (webSocket) => {
		if (bridge.attach(webSocket)) socketServer.emit('connection', webSocket, request)
	})
})

httpServer.on('error', (error: NodeJS.ErrnoException) => {
	if (error.code === 'EADDRINUSE') {
		console.error(
			`[MCP bridge] Port ${MCP_BRIDGE_PORT} is already in use. Stop the process using it (for example: lsof -nP -iTCP:${MCP_BRIDGE_PORT} -sTCP:LISTEN), then run npm run dev again.`
		)
		process.exitCode = 1
		return
	}
	console.error('[MCP bridge] Server error:', error)
	process.exitCode = 1
})

httpServer.listen(MCP_BRIDGE_PORT, HOST, () => {
	console.log(`[MCP bridge] Ready at http://${HOST}:${MCP_BRIDGE_PORT}/mcp`)
})

async function shutDown() {
	for (const transport of transports.values()) await transport.close()
	socketServer.close()
	httpServer.close()
}

process.once('SIGINT', () => void shutDown())
process.once('SIGTERM', () => void shutDown())
