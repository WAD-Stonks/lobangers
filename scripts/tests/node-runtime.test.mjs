import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))

// Exercise the actual launcher, pnpm and Vitest in an isolated repository. Never
// read or change the checkout's .env, and never import an application DB client.
for (const [workspace, script, inherited, stripsDatasource] of [
  ['apps/api', 'test:integration', true, true],
  ['apps/api', 'test:integration', false, true],
  ['apps/api', 'test:unit', true, false],
  ['apps/api', 'dev', false, false],
  ['apps/api', 'test:integration:other', true, false],
  ['apps/web', 'test:integration', true, false],
  ['packages/db', 'test:integration', false, false],
]) {
  test(`workspace ${workspace} ${script} preserves environment except exact API integration datasource (inherited=${inherited})`, () => {
    const fixture = mkdtempSync(join(tmpdir(), 'workspace-datasource-'))
    try {
      const fixtureScripts = join(fixture, 'scripts')
      const fixtureWorkspace = join(fixture, workspace)
      mkdirSync(fixtureScripts, { recursive: true })
      mkdirSync(fixtureWorkspace, { recursive: true })
      for (const filename of ['workspace.ts', 'environment.ts', 'processes.ts'])
        copyFileSync(join(root, 'scripts', filename), join(fixtureScripts, filename))
      symlinkSync(join(root, 'node_modules'), join(fixture, 'node_modules'), 'dir')
      writeFileSync(join(fixture, 'package.json'), JSON.stringify({ type: 'module' }))
      writeFileSync(
        join(fixture, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { paths: { '@scripts/*': ['./scripts/*'] } } }),
      )
      const rootDatasource = 'mongodb://root-datasource.invalid:27017/never_connect'
      const inheritedDatasource = 'mongodb://inherited-datasource.invalid:27017/never_connect'
      writeFileSync(
        join(fixture, '.env'),
        `DATABASE_URL=${rootDatasource}\nFIXTURE_ROOT_ONLY=root-default\nFIXTURE_OVERRIDE=root-value\n`,
      )
      const receipt = join(fixture, 'vitest-environment.json')
      const config = join(fixture, 'vitest.config.mjs')
      writeFileSync(
        config,
        `export default { test: { include: ['environment.test.mjs'], environment: 'node' } }\n`,
      )
      writeFileSync(
        join(fixtureWorkspace, 'environment.test.mjs'),
        `import { writeFileSync } from 'node:fs'
import { test } from 'vitest'
test('records actual Vitest child environment without connecting', () => {
  writeFileSync(${JSON.stringify(receipt)}, JSON.stringify({
    datasourcePresent: Object.hasOwn(process.env, 'DATABASE_URL'),
    datasource: process.env.DATABASE_URL ?? null,
    rootOnly: process.env.FIXTURE_ROOT_ONLY,
    inheritedOnly: process.env.FIXTURE_INHERITED_ONLY,
    override: process.env.FIXTURE_OVERRIDE,
    cwd: process.cwd(),
  }))
})
`,
      )
      writeFileSync(
        join(fixtureWorkspace, 'package.json'),
        JSON.stringify({
          type: 'module',
          scripts: {
            [script]: `node ${JSON.stringify(join(root, 'node_modules/vitest/vitest.mjs'))} run --config ${JSON.stringify(config)}`,
          },
        }),
      )
      const env = {
        ...process.env,
        TSX_TSCONFIG_PATH: join(fixture, 'tsconfig.json'),
        FIXTURE_INHERITED_ONLY: 'inherited-value',
        FIXTURE_OVERRIDE: 'inherited-wins',
      }
      delete env.DATABASE_URL
      delete env.FIXTURE_ROOT_ONLY
      if (inherited) env.DATABASE_URL = inheritedDatasource
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', join(fixtureScripts, 'workspace.ts'), workspace, script],
        { cwd: fixture, env, encoding: 'utf8', timeout: 30_000 },
      )
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
      assert.deepEqual(JSON.parse(readFileSync(receipt, 'utf8')), {
        datasourcePresent: !stripsDatasource,
        datasource: stripsDatasource ? null : inherited ? inheritedDatasource : rootDatasource,
        rootOnly: 'root-default',
        inheritedOnly: 'inherited-value',
        override: 'inherited-wins',
        cwd: realpathSync(fixtureWorkspace),
      })
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })
}

test('explicit Prisma generation runs under Node without a legacy executable', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'node-runtime-'))
  try {
    const marker = join(fixture, 'legacy-runtime-used')
    writeFileSync(
      join(fixture, 'bun'),
      `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'invoked'); process.exit(97)\n`,
      { mode: 0o700 },
    )
    const result = spawnSync('pnpm', ['run', 'db:generate'], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${fixture}:${process.env.PATH}`,
        DATABASE_URL: 'mongodb://127.0.0.1:27017/node_runtime_fixture?replicaSet=rs0',
      },
      encoding: 'utf8',
      timeout: 90_000,
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.equal(existsSync(marker), false, existsSync(marker) ? readFileSync(marker, 'utf8') : '')
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
