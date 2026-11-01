import { createHash } from 'node:crypto'
import { moneyDigestPostSchema } from '@api/modules/ingestion/parser'
import type { SourceDefinition } from '@api/modules/ingestion/source'
import { parseSourceIdentity } from '@api/modules/ingestion/source-post'
import {
  normalizeScoobifyPost,
  readProviderEnvelope,
  withProviderEnvelope,
} from '@broke-oclock/integrations/server'
import { z } from 'zod'

// Transport evidence is bounded independently of semantic parser/display limits.
// A structurally valid but overlong title must survive the subsequent parser failure.
const rendered = z.object({ rendered: z.string() })
const wordpressEnvelopeSchema = moneyDigestPostSchema.extend({
  title: rendered,
  content: rendered,
  excerpt: rendered.optional(),
})
const normalizedEnvelopeSchema = z.strictObject({
  externalId: z.string().regex(/^(?:[A-Za-z0-9_]{1,32}\/)?[1-9]\d{0,14}$/),
  url: z.url().max(2048),
  publishedAt: z.string().max(64).nullable(),
  sourceUpdatedAt: z.string().max(64).nullable(),
  title: z.string(),
  contentHtml: z.string(),
  excerptHtml: z.string(),
  images: z
    .array(z.strictObject({ url: z.url().max(8192), altText: z.string().max(500).optional() }))
    .max(5),
})

export const MAX_EVIDENCE_BYTES = 1024 * 1024
export const snapshotHash = (text: string) =>
  createHash('sha256').update(text, 'utf8').digest('hex')
// Store a JSON string, not a JSON object: database reordering must never alter bytes.
export const captureEnvelope = (input: unknown, source: SourceDefinition) => {
  const original = readProviderEnvelope(input)
  const legacy =
    source.kind === 'moneydigest' && typeof input === 'object' && input !== null && 'id' in input
  const value = original ?? input
  const text = JSON.stringify(value)
  if (typeof text !== 'string') throw new Error('INVALID_SNAPSHOT')
  if (Buffer.byteLength(text, 'utf8') > MAX_EVIDENCE_BYTES) throw new Error('SNAPSHOT_TOO_LARGE')
  z.json().parse(value)
  if (legacy) wordpressEnvelopeSchema.parse(value)
  else if (
    source.kind === 'scoobify' &&
    typeof value === 'object' &&
    value !== null &&
    'id' in value
  ) {
    // Store the original once, not original + duplicated HTML. The transport's
    // pure normalizer restores its strict parser projection on a stored replay.
    normalizeScoobifyPost(value)
  } else {
    normalizedEnvelopeSchema.parse(value)
    parseSourceIdentity(value, source)
  }
  return {
    latestSnapshot: text,
    latestSnapshotHash: snapshotHash(text),
    snapshotFormat: legacy ? 'moneydigest-v1' : 'source-post-v1',
  }
}
export const readEnvelope = (
  row: {
    latestSnapshot: unknown
    latestSnapshotHash: string | null
    snapshotFormat: string | null
  },
  source: SourceDefinition,
) => {
  if (
    typeof row.latestSnapshot !== 'string' ||
    !row.latestSnapshotHash ||
    !['moneydigest-v1', 'source-post-v1'].includes(row.snapshotFormat ?? '')
  )
    return null
  try {
    if (
      Buffer.byteLength(row.latestSnapshot) > MAX_EVIDENCE_BYTES ||
      snapshotHash(row.latestSnapshot) !== row.latestSnapshotHash
    )
      return null
    const input: unknown = JSON.parse(row.latestSnapshot)
    const validated = captureEnvelope(input, source)
    if (validated.snapshotFormat !== row.snapshotFormat) return null
    if (
      source.kind === 'scoobify' &&
      typeof input === 'object' &&
      input !== null &&
      'id' in input
    ) {
      return normalizeScoobifyPost(input)
    }
    if (row.snapshotFormat === 'moneydigest-v1') {
      const value = wordpressEnvelopeSchema.passthrough().parse(input)
      if (!value.excerpt)
        return withProviderEnvelope(
          { ...value, excerpt: { rendered: '' } },
          z.record(z.string(), z.unknown()).parse(input),
        )
    }
    return input
  } catch {
    return null
  }
}
