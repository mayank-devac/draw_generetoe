import { access, cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const judgeBuild = resolve(projectRoot, 'dist-judge')
const sitesBuild = resolve(projectRoot, 'dist')

await access(resolve(judgeBuild, 'index.html'))
await access(resolve(projectRoot, '.openai', 'hosting.json'))

await rm(sitesBuild, { recursive: true, force: true })
await mkdir(resolve(sitesBuild, 'server'), { recursive: true })
await cp(judgeBuild, resolve(sitesBuild, 'assets'), { recursive: true })

const staticSiteWorker = `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)
    if (response.status !== 404) return response

    const fallbackUrl = new URL('/index.html', request.url)
    return env.ASSETS.fetch(new Request(fallbackUrl, request))
  },
}
`

await writeFile(resolve(sitesBuild, 'server', 'index.js'), staticSiteWorker)
