import { describe, expect, it } from 'vitest'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateFixture, validateFixtureDirectory } from './validateFixtures'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

describe('validateFixture', () => {
	it('rejects unknown tool names', () => {
		expect(() =>
			validateFixture('bad.json', {
				messages: [{ role: 'user', content: 'hi' }],
				expectedCall: [{ functionName: 'not_a_real_tool', arguments: {} }],
			})
		).toThrow(/unknown tool/i)
	})

	it('accepts deterministicExecute fixtures', () => {
		const fixture = validateFixture('ok.json', {
			messages: [{ role: 'user', content: 'add image' }],
			deterministicExecute: {
				functionName: 'add_commons_image',
				arguments: { pageId: 1, x: 0, y: 0 },
			},
		})

		expect(fixture.deterministicExecute?.functionName).toBe('add_commons_image')
	})

	it('validates every committed fixture file', async () => {
		const count = await validateFixtureDirectory(fixturesDir)
		expect(count).toBeGreaterThanOrEqual(3)
	})
})
