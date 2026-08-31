import { Editor } from 'tldraw'

export function zoomOutCanvas(
	editor: Editor,
	input: { steps?: number }
): {
	mode: 'fit' | 'steps'
	steps: number | null
	previousZoomPercent: number
	zoomPercent: number
} {
	const previousZoomPercent = zoomPercent(editor)

	if (input.steps === undefined) {
		editor.zoomToFit()
	} else {
		for (let step = 0; step < input.steps; step += 1) {
			editor.zoomOut()
		}
	}

	return {
		mode: input.steps === undefined ? 'fit' : 'steps',
		steps: input.steps ?? null,
		previousZoomPercent,
		zoomPercent: zoomPercent(editor),
	}
}

function zoomPercent(editor: Editor) {
	return Math.round(editor.getZoomLevel() * 100)
}
