import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { repositoryRoot } from '@scripts/environment'
import { buildNodeApi } from '@scripts/node-api-build'

const output = join(repositoryRoot, 'apps/api/.vercel/output')
const functionDirectory = join(output, 'functions/api.func')
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
    // Beside the Singapore MongoDB Atlas cluster. Prisma on MongoDB makes several round trips
    // per request, so the default US East region turned each one into a trans-Pacific hop.
    regions: ['sin1'],
  }),
)
await writeFile(
  join(output, 'config.json'),
  JSON.stringify({
    version: 3,
    // This artifact is the sole cron owner. Repeating it in vercel.json duplicates the job.
    crons: [{ path: '/api/ingestion/scheduled-runs', schedule: '0 0 * * *' }],
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
