import { DomainError } from '@api/modules/domain-error'
import { boundedEvidence } from '@api/modules/ingestion/evidence'
import { providerFor, readTargetEnvelope, recoveryDto } from '@api/modules/ingestion/recovery'
import type { IngestionRuntime } from '@api/modules/ingestion/runtime'

import { sourceFromRecord } from '@api/modules/ingestion/source'
import type { Database } from '@api/modules/platform-admin/transaction'
import {
  postDetailSchema,
  postsPageSchema,
  type RecoveryRequest,
} from '@broke-oclock/contracts/ingestion-recovery'

const sourceSelect = {
  id: true,
  name: true,
  provider: true,
  externalId: true,
  url: true,
  enabled: true,
} as const
const postSelect = {
  id: true,
  externalId: true,
  url: true,
  title: true,
  source: { select: sourceSelect },
  status: true,
  errorCode: true,
  failureStage: true,
  contentHash: true,
  latestSnapshotHash: true,
  latestSnapshot: true,
  snapshotFormat: true,
  updatedAt: true,
  fetchedAt: true,
  processedAt: true,
} as const
const summarize = (
  row: Pick<
    Awaited<ReturnType<Database['importedPost']['findUniqueOrThrow']>>,
    | 'id'
    | 'externalId'
    | 'url'
    | 'title'
    | 'status'
    | 'errorCode'
    | 'failureStage'
    | 'contentHash'
    | 'latestSnapshotHash'
    | 'latestSnapshot'
    | 'snapshotFormat'
    | 'updatedAt'
    | 'fetchedAt'
    | 'processedAt'
  > & {
    source: {
      id: string
      name: string
      provider: string
      externalId: string
      url: string
      enabled: boolean
    }
  },
) => {
  const { latestSnapshot: _snapshot, ...rest } = row
  const source = sourceFromRecord(row.source)
  return {
    ...rest,
    snapshotAvailable: source ? readTargetEnvelope(row, source) !== null : false,
    updatedAt: row.updatedAt.toISOString(),
    fetchedAt: row.fetchedAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
  }
}
// Database scan is itself bounded. Unsupported records never become operational
// authority; a sparse page may have no rows and still expose a next cursor.
export const getPosts = async (
  db: Database,
  query: {
    status: 'NEW' | 'PARSED' | 'NEEDS_REVIEW' | 'FAILED' | 'IGNORED'
    sourceId?: string
    errorCode?: string
    limit: number
    cursor?: string
  },
) => {
  const rows = await db.importedPost.findMany({
    where: {
      status: query.status,
      ...(query.sourceId ? { sourceId: query.sourceId } : {}),
      ...(query.errorCode ? { errorCode: query.errorCode } : {}),
      ...(query.cursor ? { id: { gt: query.cursor } } : {}),
    },
    select: postSelect,
    orderBy: { id: 'asc' },
    take: query.limit + 1,
  })
  return boundedEvidence(
    postsPageSchema.parse({
      items: rows
        .slice(0, query.limit)
        .filter((row) => sourceFromRecord(row.source))
        .map(summarize),
      nextCursor: rows.length > query.limit ? (rows[query.limit - 1]?.id ?? null) : null,
    }),
  )
}
export const getPost = async (
  db: Database,
  runtime: IngestionRuntime | undefined,
  postId: string,
  query: { limit: number; cursor?: string },
) => {
  const row = await db.importedPost.findUnique({ where: { id: postId }, select: postSelect })
  const definition = row && sourceFromRecord(row.source)
  if (!row || !definition) throw new DomainError('NOT_FOUND')
  const links = await db.dealSource.findMany({
    where: { importedPostId: postId, ...(query.cursor ? { id: { gt: query.cursor } } : {}) },
    select: {
      id: true,
      dealId: true,
      sourceContentHash: true,
      deal: { select: { reviewStatus: true, contentVersion: true } },
    },
    orderBy: { id: 'asc' },
    take: query.limit + 1,
  })
  const recent = await db.ingestionRun.findFirst({
    where: { sourceId: row.source.id },
    orderBy: { startedAt: 'desc' },
  })
  const source = await db.importSource.findUniqueOrThrow({ where: { id: row.source.id } })
  const latest = await db.ingestionRecovery.findFirst({
    where: { postId },
    orderBy: { requestedAt: 'desc' },
  })
  const now = runtime?.now() ?? new Date()
  const common = [
    ...(!runtime?.enabled ? ['Ingestion opt-in is disabled'] : []),
    ...(!row.source.enabled ? ['Source is disabled'] : []),
    ...(!runtime || !providerFor(runtime, definition)?.reuseApproved
      ? ['Source reuse approval unavailable']
      : []),
    ...(source.leaseExpiresAt && source.leaseExpiresAt > now
      ? ['Source has an active owner lease']
      : []),
    ...(recent && now.getTime() - recent.startedAt.getTime() < 30_000
      ? ['Source request cooldown (30 seconds)']
      : []),
  ]
  return boundedEvidence(
    postDetailSchema.parse({
      post: summarize(row),
      citations: links.slice(0, query.limit).map((link) => ({
        id: link.id,
        dealId: link.dealId,
        pinnedHash: link.sourceContentHash,
        reviewStatus: link.deal.reviewStatus,
        contentVersion: link.deal.contentVersion,
      })),
      nextCitationCursor: links.length > query.limit ? (links[query.limit - 1]?.id ?? null) : null,
      capabilities: (
        ['REPROCESS_STORED', 'REFRESH_SOURCE_WINDOW'] as RecoveryRequest['mode'][]
      ).map((mode) => {
        const blockers = [
          ...common,
          ...(mode === 'REPROCESS_STORED' && readTargetEnvelope(row, definition) === null
            ? [
                'Validated exact stored envelope unavailable; legacy rawContent is not a provider payload',
              ]
            : []),
        ]
        return { mode, allowed: !blockers.length, blockers }
      }),
      latestRecovery: latest ? recoveryDto(latest, now, source) : null,
    }),
  )
}
