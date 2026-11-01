import {
  platformAccountParamsSchema,
  platformNoteSchema,
  platformObjectIdSchema,
  platformPageSchema,
  platformVersionSchema,
} from '@contracts/platform-admin'
import { boundedQueryInteger } from '@contracts/query'
import { z } from 'zod'

export { platformAccountParamsSchema }
export const accountSecurityResponseSchema = z.strictObject({
  userId: platformObjectIdSchema,
  version: platformVersionSchema,
  emailVerified: z.boolean(),
  state: z.enum(['ACTIVE', 'SUSPENDED']),
  suspendedAt: z.iso.datetime().nullable(),
  methods: z.strictObject({
    passwordConfigured: z.boolean(),
    googleLinked: z.boolean(),
    emailOtpAvailable: z.boolean(),
  }),
})
export const accountSessionsQuerySchema = z.strictObject({
  cursor: platformObjectIdSchema.optional(),
  limit: boundedQueryInteger(1, 100, 25),
})
export const accountSessionSchema = z.strictObject({
  id: platformObjectIdSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  deviceLabel: z.string().max(100),
})
export const accountSessionsResponseSchema = platformPageSchema(accountSessionSchema).extend({
  userId: platformObjectIdSchema,
  version: platformVersionSchema,
})
export const accountSessionParamsSchema = z.strictObject({
  userId: platformObjectIdSchema,
  sessionId: platformObjectIdSchema,
})
export const accountSecurityMutationBodySchema = z.strictObject({
  expectedVersion: platformVersionSchema,
  note: platformNoteSchema,
  confirmed: z.literal(true),
})
export const accountSecurityMutationResponseSchema = z.strictObject({
  id: platformObjectIdSchema,
  version: platformVersionSchema,
  affectedSessionCount: z.number().int().nonnegative(),
})
export const securityContextResponseSchema = z.strictObject({
  actorUserId: platformObjectIdSchema,
  freshLoginUntil: z.iso.datetime().nullable(),
  reauthenticationRequired: z.boolean(),
})
export const securityEmptyQuerySchema = z.strictObject({})
export type AccountSecurityResponse = z.infer<typeof accountSecurityResponseSchema>
export type AccountSessionsQuery = z.input<typeof accountSessionsQuerySchema>
export type AccountSessionsResponse = z.infer<typeof accountSessionsResponseSchema>
export type AccountSecurityMutationBody = z.infer<typeof accountSecurityMutationBodySchema>
export type AccountSecurityMutationResponse = z.infer<typeof accountSecurityMutationResponseSchema>
export type SecurityContextResponse = z.infer<typeof securityContextResponseSchema>
