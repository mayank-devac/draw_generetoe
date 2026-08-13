import { IRequest } from 'itty-router'
import { Environment } from '../environment'

export async function recentOutputs(request: IRequest, env: Environment) {
	const id = env.AGENT_DURABLE_OBJECT.idFromName('anonymous')
	const DO = env.AGENT_DURABLE_OBJECT.get(id)
	const url = new URL(request.url)
	const response = await DO.fetch(url.origin + '/recent-outputs')
	const outputs = await response.json()
	return new Response(JSON.stringify(outputs), {
		headers: { 'Content-Type': 'application/json' },
	})
}
