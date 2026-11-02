import { z } from 'zod'

// Browser-safe schemas for Hungry Nearby: signed-in people may choose to appear on the map as a
// small anonymous avatar (/api/presence). The server only ever stores and returns a fuzzed
// point; nobody's id, name, email or exact position leaves the server.

export const PRESENCE_AVATARS = ['bao', 'chickenrice', 'kaya', 'kopi', 'ondeh', 'teh'] as const
export const presenceAvatarSchema = z.enum(PRESENCE_AVATARS)
export type PresenceAvatar = z.infer<typeof presenceAvatarSchema>

// The same box as the web map's Singapore bounds; points outside are refused.
export const PRESENCE_BOUNDS = { south: 1.15, west: 103.58, north: 1.48, east: 104.1 } as const
// A person disappears this long after their last heartbeat.
export const PRESENCE_TTL_MS = 2 * 60_000
// The browser sends a heartbeat this often while the person is shown and the tab is visible.
export const PRESENCE_HEARTBEAT_MS = 45_000
// Who is listed around a requested centre, nearest first.
export const PRESENCE_RADIUS_METRES = 2500
export const PRESENCE_MAX_ITEMS = 60

const latitudeSchema = z.number().finite().min(PRESENCE_BOUNDS.south).max(PRESENCE_BOUNDS.north)
const longitudeSchema = z.number().finite().min(PRESENCE_BOUNDS.west).max(PRESENCE_BOUNDS.east)

// An anonymous, per-session token: stable while someone stays shown so their avatar does not
// jump between polls, replaced whenever they hide or lapse.
export const presenceTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,32}$/)

export const presenceBodySchema = z.strictObject({
  lat: latitudeSchema,
  lng: longitudeSchema,
  avatar: presenceAvatarSchema.optional(),
})

// Query strings arrive as text, so the centre is coerced.
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
  // The viewer's own fuzzed spot while they are shown; null when hidden or signed out.
  me: myPresenceSchema.nullable(),
})

export const myPresenceResponseSchema = z.strictObject({ me: myPresenceSchema })
export const presenceHiddenSchema = z.strictObject({ ok: z.literal(true) })

export type PresenceBody = z.infer<typeof presenceBodySchema>
export type NearbyPerson = z.infer<typeof nearbyPersonSchema>
export type MyPresence = z.infer<typeof myPresenceSchema>
export type NearbyPeopleResponse = z.infer<typeof nearbyPeopleResponseSchema>
