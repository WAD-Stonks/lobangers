import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

// Explicit disposable loopback only. Run a copied schema outside dotenv discovery,
// and never regenerate the shared client from an integration fixture.
export const pushDisposableSchema = async (databaseUrl: string) => {
  if (!/^mongodb:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_]+\?/.test(databaseUrl))
    throw new Error('Disposable loopback replica URL required')
  const root = fileURLToPath(new URL('../../../../', import.meta.url))
  const scratch = resolve(tmpdir(), 'lobangers-app-security', `schema-${randomUUID()}`)
  await mkdir(scratch, { recursive: true })
  await copyFile(`${root}/packages/db/prisma/schema.prisma`, `${scratch}/schema.prisma`)
  await promisify(execFile)(
    `${root}/packages/db/node_modules/.bin/prisma`,
    ['db', 'push', '--skip-generate', '--schema', `${scratch}/schema.prisma`],
    {
      cwd: scratch,
      env: { PATH: process.env.PATH, HOME: scratch, TMPDIR: scratch, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      timeout: 60_000,
    },
  )
}
