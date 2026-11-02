import type { Coordinates } from '@api/modules/assistant/catalogue'
import { RAIL_STATIONS } from '@broke-oclock/contracts/rail-stations'

export type Place = Coordinates & { readonly name: string }

const SELF = /\b(?:near|around|close to) (?:me|here|my place)\b|\bnearby\b/
const BEFORE = '(?:near|around|at|by|in|from|to|nearest|close to|walking distance of)'
const AFTER = '(?:mrt|lrt|station|stn|interchange)'

const normalise = (text: string) =>
  ` ${text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `

// Longest names first, so "tampines east" wins over "tampines".
const STATIONS = RAIL_STATIONS.map(([name, line, lat, lng]) => {
  const key = normalise(name).trim()
  return {
    place: { name: `${name} ${line} station`, lat, lng },
    pattern: new RegExp(`(?:\\b${BEFORE} ${key} |\\b${key} ${AFTER}\\b)`),
    length: key.length,
  }
}).sort((a, b) => b.length - a.length)

const placeIn = (text: string): Place | null =>
  STATIONS.find(({ pattern }) => pattern.test(normalise(text)))?.place ?? null

export const findPlace = (userTextsOldestFirst: readonly string[]): Place | null => {
  for (const text of [...userTextsOldestFirst].reverse()) {
    const place = placeIn(text)
    if (place) return place
    if (SELF.test(normalise(text))) return null
  }
  return null
}
