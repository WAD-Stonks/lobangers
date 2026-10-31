import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { repositoryRoot } from '@scripts/environment'
import { buildNodeApi } from '@scripts/node-api-build'

const output = join(repositoryRoot, 'apps/api/.vercel/output')
const functionDirectory = join(output, 'functions/api.func')
const configuration = JSON.parse(
  await readFile(join(repositoryRoot, 'apps/api/vercel.json'), 'utf8'),
)
// Only replace generated output, never source or local configuration.
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await buildNodeApi('vercel', functionDirectory)
await writeFile(
  join(functionDirectory, '.vc-config.json'),
  JSON.stringify({
    runtime: 'nodejs22.x',
    architecture: 'x86_64',
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    shouldAddHelpers: true,
    // The ingestion service has a 90s soft admission budget; in-flight work may finish later.
    // This ceiling requires a compatible Vercel plan/Fluid compute setup before activation.
    maxDuration: 300,
  }),
)
await writeFile(
  join(output, 'config.json'),
  JSON.stringify({
    version: 3,
    // Build Output API deployments consume this artifact, not only vercel.json.
    crons: configuration.crons,
    routes: [
      {
        src: '/(.*)',
        dest: '/api',
        transforms: [{ type: 'request.path', op: 'set', args: '/$1' }],
      },
    ],
  }),
)
console.info('Built self-contained Node API function; no deployment or database push performed.')
