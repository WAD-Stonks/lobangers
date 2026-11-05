import { loadDeals } from '@api/modules/squad/state'
import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-01T10:00:00.000Z')
const hosted = (key: string) => `https://a2rucyxaq8.ufs.sh/f/${key}`

const row = (id: string, media: { images?: { url: string }[]; sources?: unknown[] }) => ({
  id,
  title: `Deal ${id}`,
  category: 'DRINKS',
  offerType: 'BUY_ONE_GET_ONE',
  priceMinor: null,
  discountPercent: null,
  validUntil: null,
  deletedAt: null,
  reviewStatus: 'APPROVED',
  venues: [],
  images: media.images ?? [],
  sources: media.sources ?? [],
})

const telegramSource = (key: string) => ({
  importedPost: { rawContent: '{"text":"1-for-1 kopi"}' },
  images: [
    {
      sourceUrl: `https://t.me/${key}.jpg`,
      altText: null,
      image: { status: 'HOSTED', hostedUrl: hosted(key), mimeType: 'image/jpeg' },
    },
  ],
})

const readerOf = (rows: ReturnType<typeof row>[]) =>
  ({ deal: { findMany: async () => rows } }) as unknown as Parameters<typeof loadDeals>[0]

describe('squad deal photos', () => {
  it('falls back to the imported post photo when the merchant uploaded none', async () => {
    const deals = await loadDeals(
      readerOf([row('d1', { sources: [telegramSource('kopi')] })]),
      ['d1'],
      NOW,
    )
    expect(deals[0]?.imageUrl).toBe(hosted('kopi'))
  })

  it('prefers the merchant upload over the imported photo', async () => {
    const deals = await loadDeals(
      readerOf([
        row('d1', { images: [{ url: hosted('upload') }], sources: [telegramSource('kopi')] }),
      ]),
      ['d1'],
      NOW,
    )
    expect(deals[0]?.imageUrl).toBe(hosted('upload'))
  })

  it('has no photo when neither exists', async () => {
    const deals = await loadDeals(readerOf([row('d1', {})]), ['d1'], NOW)
    expect(deals[0]?.imageUrl).toBeNull()
  })
})
