import { createHash } from 'node:crypto'
import { DomainError } from '@api/modules/domain-error'
import { MONEYDIGEST_SOURCE } from '@api/modules/ingestion/source'
import {
  isRegisteredTelegramSource,
  parseTelegramPreviewUrl,
} from '@api/modules/ingestion/telegram-source-url'
import {
  accessTransaction,
  type Database,
  requireCurrentAdmin,
} from '@api/modules/platform-admin/transaction'
import type {
  IngestionAddSourceRequest,
  IngestionSetSourceEnabledRequest,
  IngestionSource,
  IngestionSourcesQuery,
} from '@broke-oclock/contracts/ingestion-sources'

type ImportSource = Awaited<ReturnType<Database['importSource']['findUniqueOrThrow']>>

export const setIngestionSourceEnabled = async (
  db: Database,
  actorId: string,
  sourceId: string,
  input: IngestionSetSourceEnabledRequest,
  now: Date,
) =>
  accessTransaction(db, async (tx) => {
    await requireCurrentAdmin(tx, actorId)
    const source = await tx.importSource.findUnique({ where: { id: sourceId } })
    if (!source) throw new DomainError('NOT_FOUND', 'Source not found')
    if (!isRegisteredTelegramSource(source))
      throw new DomainError('FORBIDDEN', 'Only registered Telegram sources can be changed')
    if (input.enabled && !input.reuseConfirmed)
      throw new DomainError('BAD_REQUEST', 'Confirm source reuse before enabling')
    if (source.updatedAt.toISOString() !== input.expectedUpdatedAt)
      throw new DomainError('CONFLICT', 'Source changed; refresh before trying again')
    const updatedAt = new Date(Math.max(now.getTime(), source.updatedAt.getTime() + 1))
    const result = await tx.importSource.updateMany({
      where: { id: source.id, provider: 'TELEGRAM', updatedAt: source.updatedAt },
      // Keep cursor and foreign lease ownership. Workers must fence enabled AND
      // their lease before persisting; disabling invalidates their next write.
      data: { enabled: input.enabled, updatedAt },
    })
    if (result.count !== 1)
      throw new DomainError('CONFLICT', 'Source changed; refresh before trying again')
    return project({ ...source, enabled: input.enabled, updatedAt })
  })

const project = (row: ImportSource): IngestionSource => ({
  id: row.id,
  name: row.name,
  provider: row.provider,
  externalId: row.externalId,
  url: row.url,
  enabled: row.enabled,
  updatedAt: row.updatedAt.toISOString(),
})
const registered = (row: ImportSource) =>
  isRegisteredTelegramSource(row) ||
  (row.provider === MONEYDIGEST_SOURCE.provider &&
    row.externalId === MONEYDIGEST_SOURCE.externalId &&
    row.url === MONEYDIGEST_SOURCE.url)
export const listIngestionSources = async (db: Database, input: IngestionSourcesQuery) => {
  // Bound the scanned page as well as the response. Invalid legacy rows are not
  // projected; a continuation may therefore accompany a short/empty page.
  const rows = await db.importSource.findMany({
    where: {
      ...(input.cursor ? { id: { gt: input.cursor } } : {}),
      OR: [
        { provider: 'TELEGRAM' },
        {
          provider: MONEYDIGEST_SOURCE.provider,
          externalId: MONEYDIGEST_SOURCE.externalId,
          url: MONEYDIGEST_SOURCE.url,
        },
      ],
    },
    orderBy: { id: 'asc' },
    take: input.limit + 1,
  })
  const page = rows.slice(0, input.limit)
  return {
    items: page.filter(registered).map(project),
    nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
  }
}
export const addIngestionSource = async (
  db: Database,
  actorId: string,
  input: IngestionAddSourceRequest,
) => {
  const identity = parseTelegramPreviewUrl(input.previewUrl)
  const id = createHash('sha256')
    .update(`telegram-source:${identity.externalId}`)
    .digest('hex')
    .slice(0, 24)
  return accessTransaction(db, async (tx) => {
    await requireCurrentAdmin(tx, actorId)
    const duplicate = await tx.importSource.findFirst({
      where: {
        provider: 'TELEGRAM',
        OR: [
          { externalId: { equals: identity.externalId, mode: 'insensitive' } },
          { url: { equals: identity.url, mode: 'insensitive' } },
          { url: { equals: `${identity.url}/`, mode: 'insensitive' } },
        ],
      },
    })
    if (duplicate) throw new DomainError('CONFLICT', 'Telegram channel is already registered')
    return project(
      await tx.importSource.create({
        data: {
          id,
          provider: 'TELEGRAM',
          externalId: identity.externalId,
          name: input.name,
          url: identity.url,
          enabled: false,
        },
      }),
    )
  })
}
