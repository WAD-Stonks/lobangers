import { resultsTitle } from '@web/modules/browse-map/results-title'
import { describe, expect, it } from 'vitest'

describe('resultsTitle', () => {
  const base = { count: 6, loading: false, inArea: false, walkFiltered: false }

  it('says nearby only when the walking-distance filter is on', () => {
    expect(resultsTitle(base)).toBe('6 deals')
    expect(resultsTitle({ ...base, walkFiltered: true })).toBe('6 deals nearby')
    expect(resultsTitle({ ...base, count: 1, walkFiltered: true })).toBe('1 deal nearby')
  })

  it('names a drawn area and the first load', () => {
    expect(resultsTitle({ ...base, inArea: true })).toBe('6 deals in this area')
    expect(resultsTitle({ ...base, count: 0, loading: true })).toBe('Finding deals')
  })
})
