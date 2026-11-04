import { isSameShop, shopWords } from '@api/modules/deals/community-stalls'
import { describe, expect, it } from 'vitest'

const stall = (merchant: string, name: string) => ({ name, merchant: { name: merchant } })

describe('recognising a Google Maps place as a listed stall', () => {
  it('splits names into shop words without capitals, punctuation or filler', () => {
    expect(shopWords("The Beard Papa's (Bugis Junction) Pte Ltd")).toEqual([
      'beard',
      'papas',
      'bugis',
      'junction',
    ])
    expect(shopWords('Long John Silver’s')).toEqual(['long', 'john', 'silvers'])
  })

  it.each([
    ['KFC (Far East Plaza)', stall('KFC Singapore', 'KFC (Far East Plaza)')],
    ["Beard Papa's - Bugis Junction", stall("Beard Papa's", "Beard Papa's, Bugis Junction")],
    ['Molly Tea (Hillion Mall)', stall('Molly Tea', 'Hillion Mall')],
    ['Tealive Singapore', stall('Tealive Singapore', 'Tealive, Changi Airport Terminal 3')],
    ['Long John Silver’s', stall("Long John Silver's", "Long John Silver's")],
    ['ALC Rice Bowls', stall('ALC Ricebowl', 'ALC Ricebowl, Bedok Mall')],
    [
      'Nasi Lemak Ayam Taliwang - Singapore Management University',
      stall('Nasi Lemak Ayam Taliwang', 'Nasi Lemak Ayam Taliwang SMU'),
    ],
  ])('matches %s', (placeName, venue) => {
    expect(isSameShop(placeName, venue)).toBe(true)
  })

  it.each([
    ['Ya Kun Kaya Toast (Hillion Mall)', stall('Molly Tea', 'Hillion Mall')],
    ['Bedok Mall', stall('ALC Ricebowl', 'ALC Ricebowl, Bedok Mall')],
    ['Sushi Plus', stall('Sushi Express', 'Sushi Express, Hougang Mall')],
    ['Teahouse Express', stall('Tea', 'Tea')],
  ])('does not match %s', (placeName, venue) => {
    expect(isSameShop(placeName, venue)).toBe(false)
  })
})
