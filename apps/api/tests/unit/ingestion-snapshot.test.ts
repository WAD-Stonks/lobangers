import { captureEnvelope, readEnvelope, snapshotHash } from '@api/modules/ingestion/snapshot'
import { MONEYDIGEST_SOURCE } from '@api/modules/ingestion/source'
import { expect, it } from 'vitest'

const source = { kind: 'moneydigest' as const, ...MONEYDIGEST_SOURCE }
const input = {
  content: { rendered: '漢字<script>unsafe()</script>' },
  id: 2,
  link: 'https://www.moneydigest.sg/synthetic/',
  date: null,
  title: { rendered: 'Synthetic' },
  excerpt: { rendered: '' },
  extraProviderField: { immutable: true },
}
it('preserves serialized key order and extra provider fields rather than a parsed projection', () => {
  const captured = captureEnvelope(input, source)
  expect(captured.latestSnapshot).toBe(JSON.stringify(input))
  expect(captured.latestSnapshotHash).toBe(snapshotHash(JSON.stringify(input)))
  expect(readEnvelope(captured, source)).toEqual(input)
})
it('does not invent payloads from legacy objects, rawContent, unknown formats or mismatched hashes', () => {
  const captured = captureEnvelope(input, source)
  for (const value of [
    { ...captured, latestSnapshot: input },
    { ...captured, latestSnapshotHash: 'a'.repeat(64) },
    { ...captured, snapshotFormat: 'unknown' },
    { latestSnapshot: null, latestSnapshotHash: null, snapshotFormat: null },
  ])
    expect(readEnvelope(value, source)).toBeNull()
})
it('rejects a serialized oversized envelope even when recognized structural fields fit', () => {
  expect(() =>
    captureEnvelope({ ...input, extraProviderField: { immutable: '漢'.repeat(400_000) } }, source),
  ).toThrow('SNAPSHOT_TOO_LARGE')
})
