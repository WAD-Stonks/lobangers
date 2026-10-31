import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { canonicalAdminEmail } from '@api/modules/platform-admin/admin-emails'
import { parseAdminEmailArgs, runAdminEmailCommand } from '@api/tools/admin-emails'
import { describe, expect, it } from 'vitest'

const write = [
  'preapprove',
  '--email',
  'owner@example.test',
  '--apply',
  '--database',
  'disposable',
  '--expected-version',
  '0',
  '--operator',
  'fixture',
  '--reason',
  'Deliberate approval',
]
describe('admin email operator input and import boundary', () => {
  it('defaults to dry-run and normalizes only explicit operator email whitespace/case', () => {
    expect(
      parseAdminEmailArgs(['preapprove', '--email', '  Owner+Tag@Example.Test  ']),
    ).toMatchObject({ apply: false, email: 'owner+tag@example.test' })
    expect(canonicalAdminEmail('first.last+tag@gmail.com')).not.toBe(
      canonicalAdminEmail('firstlast@gmail.com'),
    )
    expect(parseAdminEmailArgs(write)).toMatchObject({
      apply: true,
      expectedVersion: 0,
      database: 'disposable',
    })
  })
  it.each(
    [
      [],
      ['seed', '--email', 'owner@example.test'],
      ['show', '--email', 'not-email'],
      ['show', '--email', 'a@example.test', '--email', 'b@example.test'],
      ['show', '--email', 'a@example.test', '--apply'],
      ['show', '--email', 'a@example.test', '--role', 'ADMIN'],
      ['history', '--email', 'a@example.test', '--limit', '101'],
      ['history', '--email', 'a@example.test', '--limit', '0'],
      ['preapprove', '--email', 'a@example.test', '--apply'],
      [...write, '--apply'],
      [...write, '--unknown'],
      write.map((value) => (value === '0' ? '-1' : value)),
      write.map((value) => (value === '0' ? '0x10' : value)),
      write.map((value) => (value === '0' ? '9007199254740992' : value)),
      write.map((value) => (value === 'fixture' ? 'x'.repeat(81) : value)),
      write.map((value) => (value === 'Deliberate approval' ? 'x'.repeat(501) : value)),
      write.map((value) => (value === 'Deliberate approval' ? '  ' : value)),
      write.map((value) => (value === 'fixture' ? 'bad\nlabel' : value)),
    ].map((args) => ({ args })),
  )('rejects malformed/ambiguous arguments before any database import: $args', ({ args }) => {
    expect(() => parseAdminEmailArgs(args)).toThrow()
  })
  it('validates explicit target database before connecting and never exposes credentials', async () => {
    await expect(
      runAdminEmailCommand(write, { DATABASE_URL: 'mongodb://private:secret@127.0.0.1:1/wrong' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Database-name confirmation does not match',
    })
    await expect(
      runAdminEmailCommand(['show', '--email', 'owner@example.test'], {}),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
  it('importing the executable never imports the ambient singleton, dispatches or connects', async () => {
    const { stdout, stderr } = await promisify(execFile)(
      'pnpm',
      [
        'exec',
        'tsx',
        '--eval',
        "import('./src/tools/admin-emails.ts').then(() => console.log('import-only'))",
      ],
      {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR,
          DATABASE_URL: 'invalid-ambient-database',
          BETTER_AUTH_SECRET: 'invalid',
        },
        timeout: 20_000,
      },
    )
    expect(stdout.trim()).toBe('import-only')
    expect(stderr).toBe('')
  })
})
