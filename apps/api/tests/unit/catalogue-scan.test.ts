import { scanCataloguePage } from '@api/modules/venues/catalogue-scan'
import { describe, expect, it, vi } from 'vitest'

const ids = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: index.toString(16).padStart(24, '0'),
    n: index,
  }))
const source = (rows: ReturnType<typeof ids>) =>
  vi.fn(async (after: string | undefined, take: number) =>
    rows.filter((row) => after === undefined || row.id > after).slice(0, take),
  )

describe('scanCataloguePage', () => {
  it('gathers a full page across batches and resumes after the last row it returned', async () => {
    const rows = ids(50)
    const fetch = source(rows)
    const first = await scanCataloguePage({
      fetch,
      keep: (row) => row.n % 3 === 0,
      limit: 5,
      batch: 4,
    })
    expect(first.items.map((row) => row.n)).toEqual([0, 3, 6, 9, 12])
    expect(first.nextCursor).toBe(rows[12]?.id)
    const second = await scanCataloguePage({
      fetch,
      keep: (row) => row.n % 3 === 0,
      limit: 5,
      batch: 4,
      after: first.nextCursor ?? undefined,
    })
    expect(second.items.map((row) => row.n)).toEqual([15, 18, 21, 24, 27])
  })

  it('reports the end only when the rows run out', async () => {
    const result = await scanCataloguePage({
      fetch: source(ids(10)),
      keep: (row) => row.n >= 8,
      limit: 5,
      batch: 4,
    })
    expect(result).toEqual({ items: [ids(10)[8], ids(10)[9]], nextCursor: null })
  })

  it('stops at the scan budget with a cursor to continue, never a false end', async () => {
    const rows = ids(100)
    const fetch = source(rows)
    const result = await scanCataloguePage({
      fetch,
      keep: () => false,
      limit: 5,
      batch: 10,
      budget: 3,
    })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ items: [], nextCursor: rows[29]?.id })
  })
})
