import { parseDealCopyBatch } from '@api/tools/deal-copy/batch'
import { describe, expect, it } from 'vitest'

const ID = '9beba83e8a148d6ff7d4aa7a'
const batchWith = (rewrite: Record<string, unknown>) => ({
  note: 'test batch',
  rewrites: [{ id: ID, from: 'old', ...rewrite }],
})

describe('parseDealCopyBatch', () => {
  it('accepts copy that fits the card and panel limits', () => {
    const batch = parseDealCopyBatch({
      note: 'after scrape',
      rewrites: [
        { id: ID, field: 'title', from: 'A long headline', to: '1-for-1 iced kopi' },
        { id: ID, field: 'description', from: 'Notes', to: 'Buy one iced kopi and get one free.' },
        { id: ID, field: 'terms', from: null, to: 'Weekdays only. Dine-in only.' },
        { id: ID, field: 'category', from: 'FOOD', to: 'DRINKS', previously: ['SNACKS'] },
      ],
    })
    expect(batch.rewrites).toHaveLength(4)
  })

  it('rejects a title too long for a deal card', () => {
    expect(() =>
      parseDealCopyBatch(
        batchWith({ field: 'title', to: 'Free Tealive bubble tea at Changi Terminal 3 opening' }),
      ),
    ).toThrow(/title/i)
  })

  it('rejects terms with more points than the panel lists comfortably', () => {
    expect(() =>
      parseDealCopyBatch(batchWith({ field: 'terms', to: 'One. Two. Three. Four. Five.' })),
    ).toThrow(/points/i)
  })

  it('rejects a single terms point that runs on', () => {
    expect(() =>
      parseDealCopyBatch(batchWith({ field: 'terms', to: `${'word '.repeat(25)}end.` })),
    ).toThrow(/point/i)
  })

  it('rejects a category the map cannot draw', () => {
    expect(() => parseDealCopyBatch(batchWith({ field: 'category', to: 'GROCERIES' }))).toThrow(
      /category/i,
    )
  })

  it('rejects a malformed deal id', () => {
    expect(() =>
      parseDealCopyBatch({
        note: 'x',
        rewrites: [{ id: 'abc', field: 'title', from: 'a', to: 'b' }],
      }),
    ).toThrow()
  })
})

describe('parseDealCopyBatch cuisine', () => {
  it('accepts a listed cuisine or null, and rejects anything else', () => {
    expect(
      parseDealCopyBatch(batchWith({ field: 'cuisine', from: null, to: 'JAPANESE' })).rewrites,
    ).toHaveLength(1)
    expect(
      parseDealCopyBatch(batchWith({ field: 'cuisine', from: 'CAFE', to: null })).rewrites,
    ).toHaveLength(1)
    expect(() =>
      parseDealCopyBatch(batchWith({ field: 'cuisine', from: null, to: 'FUSION' })),
    ).toThrow(/cuisine/i)
  })
})
