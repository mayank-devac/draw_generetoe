import { getPromptPartUtilsRecord } from '../../shared/AgentUtils'
import { AgentPrompt } from '../../shared/types/AgentPrompt'
import {
	AgentModelName,
	AgentThinkingLevel,
	DEFAULT_MODEL_NAME,
	getDefaultThinkingLevel,
	isThinkingLevelSupported,
} from '../../shared/models'

/**
 * Get the selected model name from a prompt.
 */
export function getModelName(prompt: AgentPrompt): AgentModelName {
	const utils = getPromptPartUtilsRecord()

	for (const part of Object.values(prompt)) {
		const util = utils[part.type]
		if (!util) continue
		const modelName = util.getModelName(part)
		if (modelName) return modelName
	}

	return DEFAULT_MODEL_NAME
}

/** Get and validate the immutable model/effort pair carried by this prompt. */
export function getModelSelection(prompt: AgentPrompt): {
	modelName: AgentModelName
	thinkingLevel: AgentThinkingLevel | null
} {
	const modelName = getModelName(prompt)
	const requestedLevel = prompt.modelName?.thinkingLevel
	return {
		modelName,
		thinkingLevel: isThinkingLevelSupported(modelName, requestedLevel)
			? requestedLevel
			: getDefaultThinkingLevel(modelName),
	}
}
