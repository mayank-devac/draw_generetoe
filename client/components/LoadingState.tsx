import { useEffect, useState } from 'react'

const chevron = Array.from({ length: 9 }, (_, i) => {
	const row = Math.floor(i / 3)
	const column = i % 3
	return (column + Math.abs(row - 1)) * 90
})

const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3]
const orbit = Array.from({ length: 9 }, (_, i) => {
	const position = ORBIT_ORDER.indexOf(i)
	return position === -1 ? null : position * 110
})

const PATTERNS: Record<
	string,
	{ delays: (number | null)[]; duration: number; round: boolean }
> = {
	Drive: { delays: chevron, duration: 650, round: false },
	Dots: { delays: chevron, duration: 650, round: true },
	Orbit: { delays: orbit, duration: 950, round: false },
}

function useElapsed() {
	const [deciseconds, setDeciseconds] = useState(0)

	useEffect(() => {
		const timer = window.setInterval(() => setDeciseconds((value) => value + 1), 100)
		return () => window.clearInterval(timer)
	}, [])

	const totalSeconds = deciseconds / 10
	if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`
	return `${Math.floor(totalSeconds / 60)}m ${(totalSeconds % 60).toFixed(1)}s`
}

export function LoadingState({
	label = 'AI agent is working',
	variant = 'Drive',
}: {
	label?: string
	variant?: string
}) {
	const elapsed = useElapsed()
	const { delays, duration, round } = PATTERNS[variant] ?? PATTERNS.Drive

	return (
		<div className="agent-loading-state" role="status" aria-live="polite">
			<span aria-hidden="true" className="agent-loading-grid">
				{delays.map((delay, index) => (
					<span
						key={index}
						className={`agent-loading-pixel${round ? ' agent-loading-pixel-round' : ''}`}
						style={{
							opacity: delay === null ? 0.07 : 0.15,
							animation:
								delay === null
									? 'none'
									: `pixel-on ${duration}ms ease-in-out ${delay}ms infinite`,
						}}
					/>
				))}
			</span>
			<span className="agent-loading-label">{label}</span>
			<span className="agent-loading-elapsed" aria-hidden="true">
				{elapsed}
			</span>
		</div>
	)
}
