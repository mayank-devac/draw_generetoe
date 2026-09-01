import { describe, expect, it } from 'vitest'
import { redactSensitiveQueryParameters } from './embedTools'

describe('redactSensitiveQueryParameters', () => {
	it('redacts sensitive query parameter values', () => {
		const result = redactSensitiveQueryParameters(
			'https://example.com/embed?api_key=secret-value&topic=math'
		)
		const url = new URL(result)
		expect(url.searchParams.get('api_key')).toBe('[REDACTED]')
		expect(url.searchParams.get('topic')).toBe('math')
	})

	it('redacts nested URLs in query parameter values up to depth 2', () => {
		const nested = encodeURIComponent('https://inner.example/path?token=inner-secret')
		const result = redactSensitiveQueryParameters(`https://example.com/embed?redirect=${nested}`)
		const outer = new URL(result)
		const inner = new URL(decodeURIComponent(outer.searchParams.get('redirect') ?? ''))
		expect(inner.searchParams.get('token')).toBe('[REDACTED]')
		expect(result).not.toContain('inner-secret')
	})

	it('returns invalid URL strings unchanged', () => {
		const raw = 'not-a-valid-url'
		expect(redactSensitiveQueryParameters(raw)).toBe(raw)
	})
})
