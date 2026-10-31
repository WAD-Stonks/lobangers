import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DomainError } from '@api/modules/domain-error'
import {
  adminEmailHistory,
  canonicalAdminEmail,
  inspectAdminEmail,
  operateAdminEmail,
} from '@api/modules/platform-admin/admin-emails'

const invalid = () =>
  new DomainError(
    'BAD_REQUEST',
    'Use show|history|preapprove|revoke --email EMAIL; writes require --apply --database NAME --expected-version N --operator LABEL --reason TEXT',
  )
const integer = (value: string | undefined) => {
  if (!value || !/^(0|[1-9][0-9]*)$/u.test(value) || !Number.isSafeInteger(Number(value)))
    throw invalid()
  return Number(value)
}
export const parseAdminEmailArgs = (args: string[]) => {
  const [action, ...rest] = args
  if (action !== 'show' && action !== 'history' && action !== 'preapprove' && action !== 'revoke')
    throw invalid()
  const flags = new Map<string, string>()
  let apply = false
  const allowed = new Set([
    '--email',
    ...(action === 'history' ? ['--limit'] : []),
    ...(['preapprove', 'revoke'].includes(action)
      ? ['--database', '--expected-version', '--operator', '--reason']
      : []),
  ])
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i] ?? ''
    if (key === '--apply' && ['preapprove', 'revoke'].includes(action) && !apply) {
      apply = true
      continue
    }
    if (!allowed.has(key) || flags.has(key)) throw invalid()
    const value = rest[++i]
    if (!value || value.startsWith('--')) throw invalid()
    flags.set(key, value)
  }
  const email = canonicalAdminEmail(flags.get('--email') ?? '')
  const limit = flags.has('--limit') ? integer(flags.get('--limit')) : 20
  if (limit < 1 || limit > 100) throw invalid()
  const expectedVersion = flags.has('--expected-version')
    ? integer(flags.get('--expected-version'))
    : undefined
  const operatorLabel = flags.get('--operator')?.trim()
  const reason = flags.get('--reason')?.trim()
  const database = flags.get('--database')
  if (apply && (!database || expectedVersion === undefined || !operatorLabel || !reason))
    throw invalid()
  for (const [value, max] of [
    [operatorLabel, 80],
    [reason, 500],
  ] as const)
    if (
      value !== undefined &&
      (!value ||
        value.length > max ||
        [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
    )
      throw invalid()
  return { action, email, apply, limit, database, expectedVersion, operatorLabel, reason } as const
}

// Deliberately no ambient client import or construction at module scope.
export const runAdminEmailCommand = async (
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
) => {
  const input = parseAdminEmailArgs(args)
  const url = env.DATABASE_URL ?? ''
  const match = /^mongodb(?:\+srv)?:\/\/[^/]+\/([A-Za-z0-9_-]+)(?:\?[^#]*)?$/u.exec(url)
  if (!match?.[1])
    throw new DomainError(
      'BAD_REQUEST',
      'An explicit Mongo DATABASE_URL with a database name is required',
    )
  const database = match[1]
  if (input.apply && input.database !== database)
    throw new DomainError('BAD_REQUEST', 'Database-name confirmation does not match')
  const { PrismaClient } = await import('@broke-oclock/db/constructor')
  const db = new PrismaClient({ datasources: { db: { url } } })
  try {
    const result =
      input.action === 'history'
        ? await adminEmailHistory(db, input.email, input.limit)
        : input.action === 'show'
          ? await inspectAdminEmail(db, input.email)
          : await operateAdminEmail(db, { ...input, action: input.action })
    return { database: { name: database }, ...result }
  } finally {
    await db.$disconnect()
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    console.log(JSON.stringify(await runAdminEmailCommand(process.argv.slice(2)), null, 2))
  } catch (error) {
    // Never print driver errors, URLs/credentials, stacks or provider/auth payloads.
    console.error(
      JSON.stringify({
        code: error instanceof DomainError ? error.code : 'INTERNAL_SERVER_ERROR',
        message:
          error instanceof DomainError
            ? error.message
            : 'Admin-email operation not confirmed; inspect show/history before retrying',
      }),
    )
    process.exitCode = 1
  }
}
