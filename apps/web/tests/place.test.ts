import {
  placeAddress,
  placeName,
  readPlaceIds,
  sharedBuilding,
} from '@web/modules/venues-feed/place'
import { describe, expect, it } from 'vitest'

const venue = (name: string, address = '1 Orchard Road', postalCode: string | null = '238824') => ({
  name,
  address,
  postalCode,
})

describe('placeName', () => {
  it('names the building every outlet shares', () => {
    expect(
      placeName([
        venue('Papitto Gelato, YMCA One Orchard'),
        venue('Kopi Corner, YMCA one orchard'),
      ]),
    ).toBe('YMCA One Orchard')
  })

  it('falls back to the building in the address', () => {
    expect(
      placeName([
        venue('Papitto Gelato', 'YMCA, #01-02, 1 Orchard Road'),
        venue('Kopi Corner', 'YMCA, #01-05, 1 Orchard Road'),
      ]),
    ).toBe('YMCA')
  })

  it('falls back to the street when the address names no building', () => {
    expect(placeName([venue('A'), venue('B')])).toBe('1 Orchard Road')
  })
})

describe('placeAddress', () => {
  it("drops one outlet's unit number from a place's address", () => {
    expect(placeAddress([venue('A', 'YMCA, #01-02, 1 Orchard Road'), venue('B')])).toBe(
      'YMCA, 1 Orchard Road, Singapore 238824',
    )
  })

  it('adds the postal code only once', () => {
    expect(placeAddress([venue('A', '1 Orchard Road, Singapore 238824')])).toBe(
      '1 Orchard Road, Singapore 238824',
    )
  })
})

describe('readPlaceIds', () => {
  it('reads the outlets from the route param', () => {
    expect(readPlaceIds('a,b, c,')).toEqual(['a', 'b', 'c'])
    expect(readPlaceIds(undefined)).toEqual([])
  })
})

describe('sharedBuilding', () => {
  it('names the building only when every outlet agrees', () => {
    expect(sharedBuilding(['Genki Sushi, Plaza Singapura', 'SEORAE JIB, Plaza Singapura'])).toBe(
      'Plaza Singapura',
    )
    expect(sharedBuilding(['Genki Sushi, Plaza Singapura', 'Kopi Corner'])).toBeNull()
  })
})
