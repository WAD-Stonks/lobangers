import { dealObjectIdSchema } from '@contracts/deal-forms'
import { z } from 'zod'

// Browser-safe schemas for Makan Squad rooms (/api/squad/...). A room is polled through
// POST /sync, which doubles as the heartbeat; GET reads never write.

export const SQUAD_MIN_SIZE = 2
export const SQUAD_MAX_SIZE = 8
export const SQUAD_MAX_DEALS = 10
export const SQUAD_NAME_MAX = 16
export const SQUAD_AVATARS = ['kopi', 'teh', 'bao', 'kaya', 'ondeh', 'chickenrice'] as const
// Each tap on Yay or Nah counts; past this, extra taps still show locally but are not stored.
export const SQUAD_MAX_TAPS = 999

export const squadCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}$/, 'Codes are four letters')
export const squadAvatarSchema = z.enum(SQUAD_AVATARS)
export const squadNameSchema = z
  .string()
  .trim()
  .min(1, 'Type the name your friends know you by')
  .max(SQUAD_NAME_MAX, `Keep it to ${SQUAD_NAME_MAX} characters`)

export const squadCodeParamsSchema = z.strictObject({ code: squadCodeSchema })
export const squadMemberParamsSchema = z.strictObject({
  code: squadCodeSchema,
  memberId: dealObjectIdSchema,
})
export const squadEmptyQuerySchema = z.strictObject({})

export const squadCreateSchema = z.strictObject({
  dealIds: z.array(dealObjectIdSchema).min(1).max(SQUAD_MAX_DEALS),
  capacity: z.number().int().min(SQUAD_MIN_SIZE).max(SQUAD_MAX_SIZE),
  displayName: squadNameSchema,
  avatar: squadAvatarSchema,
})
export const squadJoinSchema = z.strictObject({
  displayName: squadNameSchema,
  avatar: squadAvatarSchema,
})
export const squadSyncSchema = z.strictObject({ after: z.number().int().min(0).default(0) })
export const squadVoteSchema = z.strictObject({
  stance: z.enum(['YAY', 'NAH']),
  // Taps since the last send, so a burst of spamming is one request.
  taps: z.number().int().min(1).max(20).default(1),
})
export const squadChoiceSchema = z.strictObject({ choice: z.enum(['AGAIN', 'NEXT']) })
export const squadAddDealsSchema = z.strictObject({
  dealIds: z.array(dealObjectIdSchema).min(1).max(SQUAD_MAX_DEALS),
})

export const squadEventKindSchema = z.enum([
  'JOINED',
  'LEFT',
  'KICKED',
  'HOST_CHANGED',
  'STARTED',
  'YAY',
  'NAH',
  'AGAIN',
  'NEXT',
  'REVOTE',
  'NEXT_DEAL',
  'DEAL_ENDED',
  'MATCH',
  'OUT_OF_DEALS',
  'DEALS_ADDED',
  'CLOSED',
])

export const squadEventSchema = z.strictObject({
  seq: z.number().int().positive(),
  kind: squadEventKindSchema,
  memberId: dealObjectIdSchema.nullable(),
  dealIndex: z.number().int().nonnegative().nullable(),
  at: z.iso.datetime(),
})

export const squadDealSchema = z.strictObject({
  id: dealObjectIdSchema,
  title: z.string(),
  label: z.string(),
  category: z.string(),
  priceMinor: z.number().int().nullable(),
  imageUrl: z.string().nullable(),
  venueId: dealObjectIdSchema.nullable(),
  venueName: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  // The deal stopped running after the room picked it.
  ended: z.boolean(),
})

export const squadMemberSchema = z.strictObject({
  id: dealObjectIdSchema,
  name: z.string(),
  avatar: squadAvatarSchema,
  isHost: z.boolean(),
  spectator: z.boolean(),
  // Not heard from for a while (closed the app or lost signal); not waited on for votes.
  away: z.boolean(),
  stance: z.enum(['YAY', 'NAH']).nullable(),
  choice: z.enum(['AGAIN', 'NEXT']).nullable(),
  yays: z.number().int().nonnegative(),
})

export const squadStateSchema = z.strictObject({
  code: z.string(),
  status: z.enum(['LOBBY', 'LIVE', 'CLOSED']),
  phase: z.enum(['VOTING', 'DECIDING', 'MATCHED', 'OUT_OF_DEALS']),
  closeReason: z.enum(['HOST_CLOSED', 'EXPIRED', 'EMPTY']).nullable(),
  capacity: z.number().int(),
  dealIndex: z.number().int().nonnegative(),
  round: z.number().int().nonnegative(),
  deals: z.array(squadDealSchema).max(SQUAD_MAX_DEALS * 2),
  matchDealId: dealObjectIdSchema.nullable(),
  // The deal with the most yays, offered when every deal was voted down.
  topDealId: dealObjectIdSchema.nullable(),
  members: z.array(squadMemberSchema).max(SQUAD_MAX_SIZE * 4),
  me: z
    .strictObject({
      memberId: dealObjectIdSchema,
      isHost: z.boolean(),
      spectator: z.boolean(),
      left: z.boolean(),
      kicked: z.boolean(),
    })
    .nullable(),
  tally: z.strictObject({
    yesPeople: z.number().int().nonnegative(),
    voters: z.number().int().nonnegative(),
    voted: z.number().int().nonnegative(),
    again: z.number().int().nonnegative(),
    next: z.number().int().nonnegative(),
  }),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  serverTime: z.iso.datetime(),
})

export const squadSyncResponseSchema = z.strictObject({
  state: squadStateSchema,
  events: z.array(squadEventSchema).max(200),
  nextSeq: z.number().int().nonnegative(),
})

// What the join screen shows before someone joins.
export const squadPeekSchema = z.strictObject({
  code: z.string(),
  status: z.enum(['LOBBY', 'LIVE', 'CLOSED']),
  capacity: z.number().int(),
  members: z.number().int().nonnegative(),
  hostName: z.string().nullable(),
  names: z.array(z.string()).max(SQUAD_MAX_SIZE * 4),
  createdAt: z.iso.datetime(),
  serverTime: z.iso.datetime(),
})

export type SquadPeek = z.infer<typeof squadPeekSchema>
export type SquadAvatar = z.infer<typeof squadAvatarSchema>
export type SquadCreate = z.infer<typeof squadCreateSchema>
export type SquadJoin = z.infer<typeof squadJoinSchema>
export type SquadVoteInput = z.infer<typeof squadVoteSchema>
export type SquadChoiceInput = z.infer<typeof squadChoiceSchema>
export type SquadEvent = z.infer<typeof squadEventSchema>
export type SquadEventKind = z.infer<typeof squadEventKindSchema>
export type SquadDeal = z.infer<typeof squadDealSchema>
export type SquadMember = z.infer<typeof squadMemberSchema>
export type SquadState = z.infer<typeof squadStateSchema>
export type SquadSyncResponse = z.infer<typeof squadSyncResponseSchema>
