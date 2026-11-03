import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const daily = [{ path: '/api/ingestion/scheduled-runs', schedule: '0 0 * * *' }]
const json = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'))

for (const app of ['api', 'web']) {
  test(`${app} enables automatic Git deployments only for main`, async () => {
    const config = await json(`apps/${app}/vercel.json`)
    // Vercel uses minimatch: ** also denies slash-separated branches.
    // A matching true rule takes precedence, so only the exact main branch is enabled.
    assert.deepEqual(config.git.deploymentEnabled, { '**': false, main: true })
  })
}

test('keeps scheduling out of the web project and GitHub Actions', async () => {
  const web = await json('apps/web/vercel.json')
  assert.equal(web.crons, undefined)
  await assert.rejects(stat(join(root, '.github/workflows/ingestion-hourly.yml')), {
    code: 'ENOENT',
  })
})

test('real API build declares exactly one daily cron across source and output', {
  timeout: 60_000,
}, async () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/build-vercel-api.ts'], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      USER: process.env.USER,
      LOGNAME: process.env.LOGNAME,
      TMPDIR: process.env.TMPDIR,
      NODE_ENV: 'test',
      DATABASE_URL: 'mongodb://127.0.0.1:1/cron_build_no_connection',
      BETTER_AUTH_SECRET: 'synthetic-credential-free-cron-build-only',
      INGESTION_ENABLED: 'false',
      CRON_SECRET: 'UNSET',
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
      CHECKPOINT_DISABLE: '1',
    },
    encoding: 'utf8',
    timeout: 45_000,
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  const output = await json('apps/api/.vercel/output/config.json')
  const source = await json('apps/api/vercel.json')
  const web = await json('apps/web/vercel.json')
  assert.equal(output.version, 3)
  // Vercel combines project config and Build Output API crons, rather than deduplicating them.
  const effectiveCrons = [...(source.crons ?? []), ...(output.crons ?? []), ...(web.crons ?? [])]
  assert.equal(
    effectiveCrons.length,
    1,
    'source and build output must not register duplicate crons',
  )
  assert.deepEqual(effectiveCrons, daily)
  assert.equal(source.crons, undefined)
  assert.deepEqual(output.crons, daily)
  assert.deepEqual(output.routes, [
    {
      src: '/(.*)',
      dest: '/api',
      transforms: [{ type: 'request.path', op: 'set', args: '/$1' }],
    },
  ])
  assert.deepEqual(await readdir(join(root, 'apps/api/.vercel/output/functions')), ['api.func'])
  const fn = await json('apps/api/.vercel/output/functions/api.func/.vc-config.json')
  assert.deepEqual(fn, {
    runtime: 'nodejs22.x',
    architecture: 'x86_64',
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    shouldAddHelpers: true,
    maxDuration: 300,
    // Beside the Singapore MongoDB Atlas cluster; each query is a round trip to it.
    regions: ['sin1'],
  })
})
