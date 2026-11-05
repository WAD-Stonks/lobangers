import { z } from 'zod'

export const PRESENCE_AVATARS = ['bao', 'chickenrice', 'kaya', 'kopi', 'ondeh', 'teh'] as const
export const presenceAvatarSchema = z.enum(PRESENCE_AVATARS)
export type PresenceAvatar = z.infer<typeof presenceAvatarSchema>

export const PRESENCE_BOUNDS = { south: 1.15, west: 103.58, north: 1.48, east: 104.1 } as const
export const PRESENCE_TTL_MS = 2 * 60_000
export const PRESENCE_HEARTBEAT_MS = 45_000
export const PRESENCE_RADIUS_METRES = 2500
export const PRESENCE_MAX_ITEMS = 60

const latitudeSchema = z.number().finite().min(PRESENCE_BOUNDS.south).max(PRESENCE_BOUNDS.north)
const longitudeSchema = z.number().finite().min(PRESENCE_BOUNDS.west).max(PRESENCE_BOUNDS.east)

export const presenceTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,32}$/)

export const presenceBodySchema = z.strictObject({
  lat: latitudeSchema,
  lng: longitudeSchema,
  avatar: presenceAvatarSchema.optional(),
})

export const presenceQuerySchema = z.strictObject({
  lat: z.coerce.number().pipe(latitudeSchema),
  lng: z.coerce.number().pipe(longitudeSchema),
})
export const presenceEmptyQuerySchema = z.strictObject({})

export const nearbyPersonSchema = z.strictObject({
  token: presenceTokenSchema,
  avatar: presenceAvatarSchema,
  lat: z.number(),
  lng: z.number(),
})

export const myPresenceSchema = z.strictObject({
  ...nearbyPersonSchema.shape,
  expiresAt: z.iso.datetime(),
})

export const nearbyPeopleResponseSchema = z.strictObject({
  serverTime: z.iso.datetime(),
  items: z.array(nearbyPersonSchema).max(PRESENCE_MAX_ITEMS),
  me: myPresenceSchema.nullable(),
})

export const myPresenceResponseSchema = z.strictObject({ me: myPresenceSchema })
export const presenceHiddenSchema = z.strictObject({ ok: z.literal(true) })

export type PresenceBody = z.infer<typeof presenceBodySchema>
export type NearbyPerson = z.infer<typeof nearbyPersonSchema>
export type MyPresence = z.infer<typeof myPresenceSchema>
export type NearbyPeopleResponse = z.infer<typeof nearbyPeopleResponseSchema>
