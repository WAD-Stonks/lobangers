import { excludedPlacesIn, isExcludedVenue } from '@api/modules/deals/excluded-outlets'
import { describe, expect, it } from 'vitest'

const KFC_TERMS =
  'Tuesdays only, while stocks last. Not at Punggol Oasis Terrace, Jurong Spring, Sentosa, Singapore Polytechnic or the Zoo.'

describe('excludedPlacesIn', () => {
  it('reads the places a deal says it is not valid at', () => {
    expect(excludedPlacesIn(KFC_TERMS)).toEqual([
      'punggol oasis terrace',
      'jurong spring',
      'sentosa',
      'singapore polytechnic',
      'zoo',
    ])
    expect(excludedPlacesIn('Not valid at Jewel and Changi Airport outlets.')).toEqual([
      'jewel',
      'changi airport',
    ])
    expect(excludedPlacesIn('All outlets except at Sentosa.')).toEqual(['sentosa'])
  })

  it('ignores product exclusions and missing terms', () => {
    expect(excludedPlacesIn('Excludes Reserve and Weave drinks.')).toEqual([])
    expect(excludedPlacesIn(null)).toEqual([])
  })
})

describe('isExcludedVenue', () => {
  const places = excludedPlacesIn(KFC_TERMS)

  it('matches an outlet by its name or address', () => {
    expect(isExcludedVenue({ name: 'KFC Sentosa', address: '3 Siloso Rd' }, places)).toBe(true)
    expect(
      isExcludedVenue({ name: 'KFC (Singapore Zoo Kidzworld)', address: '80 Mandai' }, places),
    ).toBe(true)
    expect(isExcludedVenue({ name: 'KFC', address: '1 Punggol Oasis Terrace' }, places)).toBe(true)
    expect(isExcludedVenue({ name: 'KFC Tampines Mall', address: '4 Tampines' }, places)).toBe(
      false,
    )
  })

  it('matches whole words only', () => {
    expect(isExcludedVenue({ name: 'KFC Zootopia', address: '' }, ['zoo'])).toBe(false)
  })
})
