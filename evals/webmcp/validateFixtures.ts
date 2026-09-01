import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { ALL_TOOL_NAMES } from '../../client/webmcp/toolNames'

const ALLOWED_TOOL_NAMES = new Set<string>(ALL_TOOL_NAMES)

const MessageSchema = z.object({
	role: z.enum(['user', 'assistant']),
	content: z.string(),
})

const ToolStubSchema = z.object({
	name: z.string(),
	description: z.string().optional(),
})

const ExpectedCallSchema = z.object({
	functionName: z.string(),
	arguments: z.record(z.string(), z.unknown()).optional(),
})

const DeterministicExecuteSchema = z.object({
	functionName: z.string(),
	arguments: z.record(z.string(), z.unknown()).optional(),
	expectedResult: z.record(z.string(), z.unknown()).optional(),
	notes: z.string().optional(),
})

const FixtureSchema = z
	.object({
		messages: z.array(MessageSchema).min(1),
		applicationState: z
			.object({
				tools: z.array(ToolStubSchema),
				notes: z.string().optional(),
			})
			.optional(),
		expectedCall: z.array(ExpectedCallSchema).optional(),
		deterministicExecute: DeterministicExecuteSchema.optional(),
	})
	.refine(
		(fixture) => fixture.expectedCall !== undefined || fixture.deterministicExecute !== undefined,
		'Fixture must include expectedCall or deterministicExecute'
	)

function assertKnownToolNames(label: string, names: string[], file: string) {
	const unknown = names.filter((name) => !ALLOWED_TOOL_NAMES.has(name))
	if (unknown.length > 0) {
		throw new Error(`${file}: ${label} references unknown tool(s): ${unknown.join(', ')}`)
	}
}

export function validateFixture(file: string, raw: unknown) {
	const parsed = FixtureSchema.parse(raw)

	const toolNames = [
		...(parsed.applicationState?.tools.map((tool) => tool.name) ?? []),
		...(parsed.expectedCall?.map((call) => call.functionName) ?? []),
	]

	if (parsed.deterministicExecute) {
		toolNames.push(parsed.deterministicExecute.functionName)
	}

	assertKnownToolNames('applicationState/expectedCall/deterministicExecute', toolNames, file)
	return parsed
}

export async function validateFixtureDirectory(dir: string) {
	const entries = (await readdir(dir)).filter((name: string) => name.endsWith('.json')).sort()
	if (entries.length === 0) throw new Error(`No fixture JSON files found in ${dir}`)

	for (const entry of entries) {
		const path = join(dir, entry)
		const raw = JSON.parse(await readFile(path, 'utf8'))
		validateFixture(path, raw)
	}

	return entries.length
}

async function main() {
	const here = dirname(fileURLToPath(import.meta.url))
	const fixturesDir = join(here, 'fixtures')
	const count = await validateFixtureDirectory(fixturesDir)
	console.log(`Validated ${count} WebMCP eval fixture(s) in ${fixturesDir}`)
}

const isMain =
	process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error))
		process.exit(1)
	})
}
