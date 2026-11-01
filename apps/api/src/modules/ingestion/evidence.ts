import { DomainError } from '@api/modules/domain-error'
import { importedDealScope } from '@api/modules/ingestion/review-policy'
import { MAX_EVIDENCE_BYTES, readEnvelope, snapshotHash } from '@api/modules/ingestion/snapshot'
import { sourceFromRecord } from '@api/modules/ingestion/source'
import { parseSourcePost } from '@api/modules/ingestion/source-post'
import type { Database } from '@api/modules/platform-admin/transaction'
import {
  citationDetailSchema,
  evidencePageSchema,
} from '@broke-oclock/contracts/ingestion-evidence'

export const boundedEvidence = <T>(value: T): T => {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_EVIDENCE_BYTES)
    throw new DomainError('PRECONDITION_FAILED', 'Evidence response exceeds 1 MiB')
  return value
}
const citationSelect = {
  id: true,
  dealId: true,
  importedPostId: true,
  sourceUrl: true,
  sourceContentHash: true,
  createdAt: true,
  _count: { select: { images: true } },
  importedPost: {
    select: {
      contentHash: true,
      latestSnapshotHash: true,
      status: true,
      errorCode: true,
      fetchedAt: true,
      source: {
        select: {
          id: true,
          name: true,
          provider: true,
          externalId: true,
          url: true,
          enabled: true,
        },
      },
    },
  },
} as const
const metadata = (
  row: Pick<
    Awaited<ReturnType<Database['dealSource']['findMany']>>[number],
    'id' | 'dealId' | 'importedPostId' | 'sourceUrl' | 'sourceContentHash' | 'createdAt'
  > & {
    _count: { images: number }
    importedPost: {
      contentHash: string
      latestSnapshotHash: string | null
      status: string
      errorCode: string | null
      fetchedAt: Date
      source: {
        id: string
        name: string
        provider: string
        externalId: string
        url: string
        enabled: boolean
      }
    }
  },
) => ({
  id: row.id,
  dealId: row.dealId,
  postId: row.importedPostId,
  sourceUrl: row.sourceUrl,
  pinnedHash: row.sourceContentHash,
  currentHash: row.importedPost.contentHash,
  latestSnapshotHash: row.importedPost.latestSnapshotHash,
  hashMatchesCurrent: row.sourceContentHash === row.importedPost.contentHash,
  postStatus: row.importedPost.status,
  errorCode: row.importedPost.errorCode,
  createdAt: row.createdAt.toISOString(),
  fetchedAt: row.importedPost.fetchedAt.toISOString(),
  imageCount: row._count.images,
  source: row.importedPost.source,
})
const member = async (db: Database, dealId: string) => {
  const deal = await db.deal.findFirst({
    where: { ...importedDealScope, id: dealId },
    select: {
      id: true,
      sources: {
        select: {
          importedPost: {
            select: {
              source: { select: { name: true, provider: true, externalId: true, url: true } },
            },
          },
        },
      },
    },
  })
  if (!deal?.sources.some((link) => sourceFromRecord(link.importedPost.source)))
    throw new DomainError('NOT_FOUND')
}
export const getDraftEvidence = async (
  db: Database,
  dealId: string,
  query: { limit: number; cursor?: string },
) => {
  await member(db, dealId)
  const rows = await db.dealSource.findMany({
    where: { dealId, ...(query.cursor ? { id: { gt: query.cursor } } : {}) },
    select: citationSelect,
    orderBy: { id: 'asc' },
    take: query.limit + 1,
  })
  // Membership is in the parent operational scope; include ALL its citations, even disabled sources.
  return boundedEvidence(
    evidencePageSchema.parse({
      items: rows.slice(0, query.limit).map(metadata),
      nextCursor: rows.length > query.limit ? rows[query.limit - 1]?.id : null,
    }),
  )
}
export const getCitationDetail = async (
  db: Database,
  dealId: string,
  citationId: string,
  query: { limit: number; cursor?: string },
) => {
  await member(db, dealId)
  const row = await db.dealSource.findFirst({
    where: { id: citationId, dealId },
    select: { ...citationSelect, sourceContentSnapshot: true },
  })
  if (!row) throw new DomainError('NOT_FOUND')
  const images = await db.dealSourceImage.findMany({
    where: { dealSourceId: row.id, ...(query.cursor ? { id: { gt: query.cursor } } : {}) },
    include: { image: true },
    orderBy: { id: 'asc' },
    take: query.limit + 1,
  })
  const text = row.sourceContentSnapshot
  const snapshotBytes = Buffer.byteLength(text, 'utf8')
  let format: 'moneydigest-v1' | 'source-post-v1' | 'UNKNOWN' = 'UNKNOWN'
  let parsed: unknown = null
  let parseError: string | null = null
  const definition = sourceFromRecord(row.importedPost.source)
  if (snapshotBytes <= MAX_EVIDENCE_BYTES && definition) {
    try {
      const input: unknown = JSON.parse(text)
      const snapshotFormat =
        definition.kind === 'moneydigest' &&
        typeof input === 'object' &&
        input !== null &&
        'id' in input
          ? 'moneydigest-v1'
          : 'source-post-v1'
      const envelope = readEnvelope(
        {
          latestSnapshot: text,
          latestSnapshotHash: row.sourceContentHash,
          snapshotFormat,
        },
        definition,
      )
      if (!envelope) throw new Error('UNRECOGNIZED_SNAPSHOT')
      const result = parseSourcePost(envelope, definition)
      format = snapshotFormat
      parsed = { status: result.status, draft: result.draft }
    } catch {
      parseError = 'UNRECOGNIZED_SNAPSHOT'
    }
  }
  const value = {
    citation: metadata(row),
    snapshot: format === 'UNKNOWN' ? null : text,
    snapshotBytes,
    format,
    availability:
      snapshotBytes > MAX_EVIDENCE_BYTES
        ? 'OVERSIZE'
        : format === 'UNKNOWN'
          ? 'UNKNOWN_FORMAT'
          : 'COMPLETE',
    hashVerified: snapshotHash(text) === row.sourceContentHash,
    parsed,
    parseError,
    images: images.slice(0, query.limit).map(({ id, sourceUrl, finalUrl, altText, image }) => ({
      id,
      sourceUrl,
      finalUrl,
      altText,
      sha256: image.id,
      url: image.status === 'HOSTED' ? image.hostedUrl : null,
      status: image.status,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
    })),
    nextImageCursor: images.length > query.limit ? (images[query.limit - 1]?.id ?? null) : null,
  }
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_EVIDENCE_BYTES) {
    value.snapshot = null
    value.parsed = null
    value.availability = 'OVERSIZE'
  }
  return boundedEvidence(citationDetailSchema.parse(value))
}
