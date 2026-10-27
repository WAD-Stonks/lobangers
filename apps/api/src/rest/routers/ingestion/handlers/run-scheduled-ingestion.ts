import { timingSafeEqual } from 'node:crypto'
import { ApiErrorException } from '@api/errors'
import { runIngestion } from '@api/modules/ingestion/service'
import type { RestDependencies } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import { ingestionRunResponseSchema } from '@broke-oclock/contracts/ingestion'
import { db } from '@broke-oclock/db'
import type { RequestHandler } from 'express'
import { z } from 'zod'

// Deliberately separate machine authentication: no cookie/session or role bypass
// is added to the browser route, and unauthorized requests never create context.
export const getScheduledIngestionRun =
  (dependencies: RestDependencies): RequestHandler =>
  async (request, response, next) => {
    try {
      const secret = dependencies.config.ingestion?.cronSecret
      const header = request.get('Authorization') ?? ''
      const expected = secret ? `Bearer ${secret}` : ''
      if (
        !secret ||
        !/^[A-Za-z0-9_-]{32,256}$/u.test(secret) ||
        Buffer.byteLength(header) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(header), Buffer.from(expected))
      )
        throw new ApiErrorException('UNAUTHORIZED', 'Scheduled ingestion authentication required')
      if (
        request.headers.cookie !== undefined ||
        request.headers.origin !== undefined ||
        request.headers['sec-fetch-site'] !== undefined
      )
        throw new ApiErrorException('FORBIDDEN', 'Machine requests only')
      parseRestInput(z.object({}).strict(), request.query)
      parseRestInput(z.undefined(), request.body)
      if (!dependencies.ingestion)
        throw new ApiErrorException('PRECONDITION_FAILED', 'Ingestion is disabled')
      response.json(
        ingestionRunResponseSchema.parse(await runIngestion(db, dependencies.ingestion)),
      )
    } catch (error) {
      next(error)
    }
  }
