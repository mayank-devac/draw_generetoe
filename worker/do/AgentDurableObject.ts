import { DurableObject } from 'cloudflare:workers'
import { AutoRouter, error } from 'itty-router'
import { AgentAction } from '../../shared/types/AgentAction'
import { AgentPrompt } from '../../shared/types/AgentPrompt'
import { AgentServerSentEvent } from '../../shared/types/Streaming'
import { Environment } from '../environment'
import { AgentService } from './AgentService'

export class AgentDurableObject extends DurableObject<Environment> {
	service: AgentService

	constructor(ctx: DurableObjectState, env: Environment) {
		super(ctx, env)
		this.service = new AgentService(this.env) // swap this with your own service
	}

	private readonly router = AutoRouter({
		catch: (e) => {
			console.error(e)
			return error(e)
		},
	}).post('/stream', (request) => this.stream(request))
	  .get('/recent-outputs', () => this.getRecentOutputs())

	// `fetch` is the entry point for all requests to the Durable Object
	override fetch(request: Request): Response | Promise<Response> {
		return this.router.fetch(request)
	}

	private async getRecentOutputs(): Promise<Response> {
		const outputs = (await this.ctx.storage.get('recentOutputs')) || []
		return new Response(JSON.stringify(outputs), {
			headers: { 'Content-Type': 'application/json' },
		})
	}

	private async addRecentOutput(output: string) {
		let outputs: string[] = (await this.ctx.storage.get('recentOutputs')) || []
		outputs.unshift(output)
		if (outputs.length > 10) {
			outputs = outputs.slice(0, 10)
		}
		await this.ctx.storage.put('recentOutputs', outputs)
	}

	/**
	 * Stream changes from the model.
	 *
	 * @param request - The request object containing the prompt.
	 * @returns A Promise that resolves to a Response object containing the streamed changes.
	 */
	private async stream(request: Request): Promise<Response> {
		const encoder = new TextEncoder()
		const { readable, writable } = new TransformStream()
		const writer = writable.getWriter()

		const response: { changes: AgentServerSentEvent<AgentAction>[] } = { changes: [] }

		;(async () => {
			try {
				const prompt = (await request.json()) as AgentPrompt
				let finalJson: string | undefined

				const stream = this.service.stream(prompt, (json) => {
					finalJson = json
				})

				for await (const change of stream) {
					response.changes.push(change)
					const data = `data: ${JSON.stringify(change)}

`
					await writer.write(encoder.encode(data))
					await writer.ready
				}

			if (finalJson) {
				await this.addRecentOutput(finalJson)
			}

				await writer.close()
			} catch (error: any) {
				console.error('Stream error:', error)

				// Send error through the stream
				const errorData = `data: ${JSON.stringify({ error: error.message })}

`
				try {
					await writer.write(encoder.encode(errorData))
					await writer.close()
				} catch (writeError) {
					await writer.abort(writeError)
				}
			}
		})()

		return new Response(readable, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache, no-transform',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no',
				'Transfer-Encoding': 'chunked',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
			},
		})
	}
}
