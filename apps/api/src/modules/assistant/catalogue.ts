import type { DealPin, DealVenuePin } from '@broke-oclock/contracts/deals'

export type CatalogueEntry = {
  readonly deal: DealPin
  readonly outlet: DealVenuePin
  readonly distanceMetres: number | null
  readonly endsToday: boolean
}
export type Coordinates = { readonly lat: number; readonly lng: number }

export const CATALOGUE_MAX = 150
const DESCRIPTION_MAX_CHARS = 120
const WALK_METRES_PER_MINUTE = 80
const EARTH_RADIUS_METRES = 6_371_000
const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const STOP_WORDS = new Set(
  'a an and any are around best can cheap cheaper deal deals eat eats ending find food for get give got have hungry i im in is it lobang lobangs looking me my near nearby of on or please show some something that the to today under want what whats where with you'.split(
    ' ',
  ),
)

const toRadians = (degrees: number) => (degrees * Math.PI) / 180
export const distanceMetres = (from: Coordinates, to: Coordinates): number => {
  const dLat = toRadians(to.lat - from.lat)
  const dLng = toRadians(to.lng - from.lng)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(a))
}

export const walkMinutesFor = (metres: number): number =>
  Math.max(1, Math.ceil(metres / WALK_METRES_PER_MINUTE))

const endOfSingaporeDay = (now: Date): number => {
  const local = now.getTime() + SINGAPORE_OFFSET_MS
  return Math.floor(local / DAY_MS) * DAY_MS + DAY_MS - SINGAPORE_OFFSET_MS
}

export const toEntry = (deal: DealPin, position: Coordinates | null, now: Date): CatalogueEntry => {
  const measured = deal.venues.map((outlet) => ({
    outlet,
    distance: position ? distanceMetres(position, outlet) : null,
  }))
  const [first] = measured
  if (!first) throw new Error('A public deal always has an outlet')
  const nearest = measured.reduce(
    (best, entry) =>
      (entry.distance ?? Number.POSITIVE_INFINITY) < (best.distance ?? Number.POSITIVE_INFINITY)
        ? entry
        : best,
    first,
  )
  const end = deal.validUntil === null ? null : Date.parse(deal.validUntil)
  return {
    deal,
    outlet: nearest.outlet,
    distanceMetres: nearest.distance,
    endsToday: end !== null && end > now.getTime() && end <= endOfSingaporeDay(now),
  }
}

const keywordsOf = (texts: readonly string[]): readonly string[] => [
  ...new Set(
    texts
      .join(' ')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)),
  ),
]

const keywordScore = (entry: CatalogueEntry, keywords: readonly string[]): number => {
  if (keywords.length === 0) return 0
  const { deal } = entry
  const haystack = [
    deal.title,
    deal.description,
    deal.category,
    deal.cuisine ?? '',
    ...deal.venues.map((venue) => venue.name),
  ]
    .join(' ')
    .toLowerCase()
  return keywords.filter((word) => haystack.includes(word)).length
}

const endTime = (entry: CatalogueEntry) =>
  entry.deal.validUntil === null ? Number.POSITIVE_INFINITY : Date.parse(entry.deal.validUntil)

// Nearest first when the visitor is located, otherwise soonest ending first.
const byRelevance = (a: CatalogueEntry, b: CatalogueEntry) =>
  a.distanceMetres !== null && b.distanceMetres !== null
    ? a.distanceMetres - b.distanceMetres
    : endTime(a) - endTime(b)

export const buildCatalogue = (
  deals: readonly DealPin[],
  options: { position: Coordinates | null; now: Date; recentUserTexts: readonly string[] },
): readonly CatalogueEntry[] => {
  const entries = deals.map((deal) => toEntry(deal, options.position, options.now))
  if (entries.length <= CATALOGUE_MAX) return [...entries].sort(byRelevance)
  const keywords = keywordsOf(options.recentUserTexts)
  return entries
    .map((entry) => ({ entry, score: keywordScore(entry, keywords) }))
    .sort((a, b) => b.score - a.score || byRelevance(a.entry, b.entry))
    .slice(0, CATALOGUE_MAX)
    .map(({ entry }) => entry)
    .sort(byRelevance)
}

const clean = (text: string, max = DESCRIPTION_MAX_CHARS) => {
  const flat = text
    .replace(/[\p{Cc}\p{Cf}|]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

const formatDollars = (minor: number) => {
  const dollars = minor / 100
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

const offerText = (deal: DealPin): string => {
  if (deal.offerType === 'FIXED_PRICE' && deal.priceMinor !== null)
    return `pay ${formatDollars(deal.priceMinor)}`
  if (deal.offerType === 'PERCENT_OFF' && deal.discountPercent !== null)
    return `${deal.discountPercent}% off, no fixed price`
  if (deal.offerType === 'BUY_ONE_GET_ONE') return '1-for-1, no fixed price'
  return deal.priceMinor === null
    ? `${clean(deal.label, 30)}, no fixed price`
    : `pay ${formatDollars(deal.priceMinor)}`
}

const dayFormat = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const timeFormat = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  hour: 'numeric',
  minute: '2-digit',
})

const endText = (entry: CatalogueEntry): string => {
  if (entry.deal.validUntil === null) return 'no end date'
  const end = new Date(entry.deal.validUntil)
  const atMidnight = (end.getTime() + SINGAPORE_OFFSET_MS) % DAY_MS === 0
  if (entry.endsToday) return atMidnight ? 'ends today' : `ends today at ${timeFormat.format(end)}`
  return `last day ${dayFormat.format(new Date(end.getTime() - 1))}`
}

const walkText = (entry: CatalogueEntry): string =>
  entry.distanceMetres === null
    ? 'walk unknown'
    : `${walkMinutesFor(entry.distanceMetres)} min walk`

export const catalogueLine = (entry: CatalogueEntry): string => {
  const { deal } = entry
  const outlets = deal.venues.length === 1 ? '1 outlet' : `${deal.venues.length} outlets`
  const verified = deal.votes.status === 'LIKELY_STILL_ON' ? 'community verified' : ''
  return [
    deal.id,
    clean(deal.title, 80),
    deal.category,
    deal.cuisine ?? 'no cuisine',
    offerText(deal),
    endText(entry),
    `nearest outlet ${clean(entry.outlet.name, 60)}`,
    walkText(entry),
    outlets,
    verified,
    `about: ${clean(deal.description)}`,
  ]
    .filter(Boolean)
    .join(' | ')
}

export const describeNow = (now: Date): string =>
  `${new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)}, ${timeFormat.format(now)} Singapore time`
