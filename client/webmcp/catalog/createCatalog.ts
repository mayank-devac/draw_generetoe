// Plan 005-B: factory helper (defineCatalogTool) + domain sub-builders.
import { TldrawAgent } from '../../agent/TldrawAgent'
import type { ToolName } from '../constants'
import type { CatalogEntry } from '../types'
import { registerActionTools } from './actionTools'
import { registerDiscoveryTools } from './discoveryTools'
import { registerStandaloneTools } from './standaloneTools'

export function createCatalog(agent: TldrawAgent) {
	const catalog = new Map<ToolName, CatalogEntry>()
	registerActionTools(agent, catalog)
	registerStandaloneTools(agent, catalog)
	registerDiscoveryTools(catalog)
	return catalog
}
