import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const daily = [{ path: '/api/ingestion/scheduled-runs', schedule: '0 0 * * *' }]
const json = async (path) => JSON.parse(await readFile(join(root, path), 'utf8'))

test('declares one daily Vercel API cron without a duplicate web or GitHub scheduler', async () => {
  const api = await json('apps/api/vercel.json')
  const web = await json('apps/web/vercel.json')
  assert.deepEqual(api.crons, daily)
  assert.equal(web.crons, undefined)
  assert.equal(api.git.deploymentEnabled, false)
  assert.equal(web.git.deploymentEnabled, false)
  await assert.rejects(stat(join(root, '.github/workflows/ingestion-hourly.yml')), {
    code: 'ENOENT',
  })
})

test('real API build emits the same daily cron and a bounded function duration', {
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
  assert.equal(output.version, 3)
  assert.deepEqual(output.crons, daily)
  assert.deepEqual(output.crons, source.crons)
  assert.deepEqual(output.routes, [
    {
      src: '/(.*)',
      dest: '/api',
      transforms: [{ type: 'request.path', op: 'set', args: '/$1' }],
    },
  ])
  const fn = await json('apps/api/.vercel/output/functions/api.func/.vc-config.json')
  assert.equal(fn.runtime, 'nodejs22.x')
  assert.equal(fn.handler, 'index.mjs')
  assert.equal(fn.maxDuration, 300)
})
