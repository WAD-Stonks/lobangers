import { captureEnvelope, readEnvelope } from '@api/modules/ingestion/snapshot'
import { MONEYDIGEST_SOURCE, SCOOBIFY_SOURCE } from '@api/modules/ingestion/source'
import { parseSourcePost } from '@api/modules/ingestion/source-post'
import {
  createMoneyDigestClient,
  createScoobifyClient,
  readProviderEnvelope,
} from '@broke-oclock/integrations/server'
import { expect, it } from 'vitest'

it('round-trips original key order and missing excerpt without inventing provider fields', async () => {
  const original = {
    extra: { nested: [null, true, '漢字'] },
    content: { protected: false, rendered: '50% off. Online only.' },
    title: { rendered: 'Pizza' },
    date: null,
    link: 'https://www.moneydigest.sg/controlled/',
    id: 75,
  }
  const [projection] = await createMoneyDigestClient({
    fetch: async () => Response.json([original]),
  }).listPosts()
  expect(projection).toHaveProperty('excerpt', { rendered: '' })
  expect(Object.keys(projection ?? {})).not.toContain('providerEnvelope')
  expect(readProviderEnvelope(projection)).toEqual(original)
  const source = { kind: 'moneydigest' as const, ...MONEYDIGEST_SOURCE }
  const envelope = captureEnvelope(projection, source)
  expect(envelope.latestSnapshot).toBe(JSON.stringify(original))
  const restored = readEnvelope(envelope, source)
  expect(restored).not.toBeNull()
  expect(() => parseSourcePost(restored, source)).not.toThrow()
  expect(captureEnvelope(restored, source)).toEqual(envelope)
})
it('captures one bounded original Scoobify object without duplicating large semantic-failure content', async () => {
  const original = {
    id: 77,
    link: 'https://scoobifydaily.wordpress.com/controlled-large/',
    title: { rendered: 'Pizza' },
    content: { rendered: '漢'.repeat(180_000), protected: false },
    date_gmt: null,
    modified_gmt: null,
    extra: { original: true },
  }
  const { posts } = await createScoobifyClient({
    fetch: async () => Response.json([original]),
  }).listPosts({ page: 1, perPage: 20 })
  const source = { kind: 'scoobify' as const, ...SCOOBIFY_SOURCE }
  expect(() => parseSourcePost(posts[0], source)).toThrow()
  const envelope = captureEnvelope(posts[0], source)
  expect(envelope.latestSnapshot).toBe(JSON.stringify(original))
  expect(captureEnvelope(readEnvelope(envelope, source), source)).toEqual(envelope)
})
it('restores normalized Scoobify projection for the strict parser while retaining exact original evidence', async () => {
  const original = {
    extra: { nested: [null, false] },
    id: 76,
    link: 'https://scoobifydaily.wordpress.com/controlled/',
    title: { rendered: 'Pizza' },
    content: { protected: false, rendered: '50% off. Online only.' },
    date_gmt: null,
    modified_gmt: null,
  }
  const { posts } = await createScoobifyClient({
    fetch: async () => Response.json([original]),
  }).listPosts({ page: 1, perPage: 20 })
  const source = { kind: 'scoobify' as const, ...SCOOBIFY_SOURCE }
  const envelope = captureEnvelope(posts[0], source)
  expect(JSON.parse(envelope.latestSnapshot)).toEqual(original)
  const restored = readEnvelope(envelope, source)
  expect(() => parseSourcePost(restored, source)).not.toThrow()
  expect(readProviderEnvelope(restored)).toEqual(original)
  expect(captureEnvelope(restored, source)).toEqual(envelope)
})
