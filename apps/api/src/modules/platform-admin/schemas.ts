import { z } from 'zod'

const objectId = z.string().regex(/^[a-f0-9]{24}$/)
export const requestSubmission = z.strictObject({
  venueId: objectId,
  message: z.string().trim().min(1).max(1000),
})
