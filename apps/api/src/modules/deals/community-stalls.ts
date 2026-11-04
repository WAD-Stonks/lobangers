import type { AppConfig } from '@api/config'
import { createRateLimiter, type RateLimiter } from '@api/modules/assistant/runtime'
import { geographySubjectHash, occupancySubjectHash } from '@api/modules/deals/outlet-eligibility'
import { DomainError } from '@api/modules/domain-error'
import { activeRecord } from '@api/modules/platform-admin/venues'
import type { CreateDealStallBody, DealPlace, DealStall } from '@broke-oclock/contracts/deal-forms'
import type { db } from '@broke-oclock/db'
import type { GooglePlacesClient, PlaceMatch } from '@broke-oclock/integrations/server'

type Database = typeof db

export type PlacesRuntime = { client: GooglePlacesClient; limiter: RateLimiter }

export const createPlacesRuntime = (
  config: AppConfig,
  external: { fetch?: typeof fetch } = {},
): PlacesRuntime | undefined => {
  const places = config.places
  if (!places) return undefined
  let client: GooglePlacesClient | undefined
  const load = async () => {
    const { createGooglePlacesClient } = await import('@broke-oclock/integrations/server')
    client ??= createGooglePlacesClient({ apiKey: places.apiKey, fetch: external.fetch })
    return client
  }
  return {
    client: {
      search: async (query) => (await load()).search(query),
      get: async (placeId) => (await load()).get(placeId),
    },
    limiter: createRateLimiter({ visitorLimit: 20, globalLimit: 300 }),
  }
}

type StallRow = {
  latitude: number
  longitude: number
  deletedAt?: Date | null
  merchant: { deletedAt?: Date | null }
}
export const isPickableStall = (venue: StallRow): boolean =>
  venue.deletedAt == null &&
  venue.merchant.deletedAt == null &&
  Number.isFinite(venue.latitude) &&
  Math.abs(venue.latitude) <= 90 &&
  Number.isFinite(venue.longitude) &&
  Math.abs(venue.longitude) <= 180 &&
  !(venue.latitude === 0 && venue.longitude === 0)

const stallSelect = {
  id: true,
  name: true,
  address: true,
  latitude: true,
  longitude: true,
  deletedAt: true,
  catalogueKey: true,
  postalCode: true,
  merchant: { select: { name: true, deletedAt: true } },
} as const

const toStall = (venue: {
  id: string
  name: string
  address: string
  merchant: { name: string }
}): DealStall => ({
  id: venue.id,
  name: venue.name,
  merchantName: venue.merchant.name,
  address: venue.address,
})

const placeKey = (placeId: string) => `google-places:${placeId}`

export const searchCommunityStalls = async (
  database: Database,
  search: string | undefined,
): Promise<DealStall[]> => {
  const words = (search ?? '')
    .split(/[\s,]+/u)
    .filter(Boolean)
    .slice(0, 8)
  const rows = await database.venue.findMany({
    where: {
      AND: [
        activeRecord,
        { merchant: { is: activeRecord } },
        ...words.map((word) => {
          const contains = { contains: word, mode: 'insensitive' as const }
          return {
            OR: [
              { name: contains },
              { merchant: { is: { name: contains } } },
              { address: contains },
              { area: contains },
            ],
          }
        }),
      ],
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: 10,
    select: stallSelect,
  })
  return rows.filter(isPickableStall).map(toStall)
}

const takePlacesCall = (places: PlacesRuntime | undefined, userId: string) => {
  if (!places) throw new DomainError('PRECONDITION_FAILED', 'Map search is not set up yet')
  if (!places.limiter.take(userId))
    throw new DomainError('TOO_MANY_REQUESTS', 'Too many map searches. Please wait a minute.')
  return places.client
}

const providerFailure = () =>
  new DomainError('BAD_GATEWAY', 'Google Maps did not answer. Please try again.')

const FILLER_WORDS = new Set(['singapore', 'sg', 'the', 'pte', 'ltd', 'and', 'at', 'of'])

export const shopWords = (name: string): string[] =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/['’‘`]/gu, '')
    .split(/[^a-z0-9]+/u)
    .filter((word) => word && !FILLER_WORDS.has(word))

export const isSameShop = (
  placeName: string,
  venue: { name: string; merchant: { name: string } },
) => {
  const placeWords = shopWords(placeName)
  const place = new Set(placeWords)
  const merchant = shopWords(venue.merchant.name)
  const shared = merchant.filter((word) => place.has(word)).length
  if (
    merchant.length > 0 &&
    (shared === merchant.length || (merchant.length >= 3 && shared / merchant.length >= 0.75))
  )
    return true
  const compactMerchant = merchant.join('')
  if (compactMerchant.length >= 5 && placeWords.join('').includes(compactMerchant)) return true
  return placeWords.length > 0 && shopWords(venue.name).join(' ') === placeWords.join(' ')
}

const SAME_PLACE_METRES = 150
const METRES_PER_DEGREE = 111_320
const metresBetween = (a: { latitude: number; longitude: number }, b: typeof a) => {
  const north = (a.latitude - b.latitude) * METRES_PER_DEGREE
  const east =
    (a.longitude - b.longitude) * METRES_PER_DEGREE * Math.cos((a.latitude * Math.PI) / 180)
  return Math.hypot(north, east)
}

const existingStall = async (database: Database, place: PlaceMatch) => {
  const reach = SAME_PLACE_METRES / METRES_PER_DEGREE
  const rows = await database.venue.findMany({
    where: {
      AND: [
        activeRecord,
        {
          OR: [
            { catalogueKey: placeKey(place.placeId) },
            ...(place.postalCode ? [{ postalCode: place.postalCode }] : []),
            {
              latitude: { gte: place.latitude - reach, lte: place.latitude + reach },
              longitude: {
                gte: place.longitude - reach * 1.01,
                lte: place.longitude + reach * 1.01,
              },
            },
          ],
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 300,
    select: stallSelect,
  })
  const live = rows.filter(isPickableStall)
  const madeFromPlace = live.find((venue) => venue.catalogueKey === placeKey(place.placeId))
  if (madeFromPlace) return madeFromPlace
  return (
    live
      .filter(
        (venue) =>
          ((place.postalCode !== null && venue.postalCode === place.postalCode) ||
            metresBetween(venue, place) <= SAME_PLACE_METRES) &&
          isSameShop(place.name, venue),
      )
      .sort((a, b) => metresBetween(a, place) - metresBetween(b, place))[0] ?? null
  )
}

export const searchStallPlaces = async (
  database: Database,
  places: PlacesRuntime | undefined,
  userId: string,
  search: string,
): Promise<DealPlace[]> => {
  const client = takePlacesCall(places, userId)
  const matches = await client.search(search).catch(() => {
    throw providerFailure()
  })
  return Promise.all(
    matches.map(async (place) => {
      const stall = await existingStall(database, place)
      return {
        placeId: place.placeId,
        name: place.name,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        stall: stall ? toStall(stall) : null,
      }
    }),
  )
}

export const addStallFromPlace = async (
  database: Database,
  places: PlacesRuntime | undefined,
  userId: string,
  input: CreateDealStallBody,
  now: Date,
): Promise<{ stall: DealStall; created: boolean }> => {
  const client = takePlacesCall(places, userId)
  const place = await client.get(input.placeId).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'NOT_FOUND')
      throw new DomainError('NOT_FOUND', 'Google Maps no longer lists that place')
    throw providerFailure()
  })
  const existing = await existingStall(database, place)
  if (existing) return { stall: toStall(existing), created: false }

  const merchant =
    (await database.merchant.findFirst({
      where: {
        AND: [activeRecord, { name: { equals: input.merchantName, mode: 'insensitive' } }],
      },
      orderBy: { createdAt: 'asc' },
    })) ??
    (await database.merchant.create({ data: { name: input.merchantName, catalogueVersion: 1 } }))

  const created = await database.venue.create({
    data: {
      merchantId: merchant.id,
      name: place.name,
      address: place.address,
      postalCode: place.postalCode,
      latitude: place.latitude,
      longitude: place.longitude,
      catalogueKey: placeKey(place.placeId),
      geographyPrecision: 'OUTLET',
      catalogueVersion: 1,
    },
  })
  const receipt = {
    provider: 'GOOGLE_PLACES' as const,
    reference: `${placeKey(place.placeId)}#added-by:${userId}`,
    sourceUrl: `https://www.google.com/maps/place/?q=place_id:${place.placeId}`,
    observedAt: now,
  }
  const venue = await database.venue.update({
    where: { id: created.id },
    data: {
      geographyEvidence: {
        ...receipt,
        state: 'VERIFIED',
        verifiedAt: now,
        subjectHash: geographySubjectHash(created),
      },
      occupancyEvidence: {
        ...receipt,
        state: 'UNVERIFIED',
        subjectHash: occupancySubjectHash(created),
      },
    },
  })
  return { stall: toStall({ ...venue, merchant }), created: true }
}
