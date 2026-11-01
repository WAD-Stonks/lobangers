import type { AppConfig } from '@api/config'
import {
  type AuthenticatedActor,
  requireActiveSessionWrite,
} from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import { fromNodeHeaders } from '@broke-oclock/auth/node'
import { db } from '@broke-oclock/db'
import { type CompletedPhotoUpload, createPhotoUploadHandler } from '@broke-oclock/storage/server'
import { type ErrorRequestHandler, json, type Request, Router } from 'express'

type UploadSession = { user: { id: string }; session: { id: string } } | null
type GetSession = (headers: Headers) => Promise<UploadSession>

// Record who uploaded each photo, so a deal can later attach only its own submitter's file.
// The provider may repeat a callback; the first owner of a key is kept.
const recordUpload = async (
  database: Pick<typeof db, 'uploadedFile'>,
  upload: CompletedPhotoUpload,
) => {
  await database.uploadedFile.upsert({
    where: { key: upload.key },
    create: {
      key: upload.key,
      url: upload.url,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      uploaderId: upload.userId,
    },
    update: {},
  })
}

export const createPhotoRouter = (config: AppConfig, getSession: GetSession) => {
  const router = Router()
  const storage = config.photoStorage
  if (!storage) {
    router.use((_request, response) => {
      response.status(503).json({ error: 'Photo storage is not configured' })
    })
    return router
  }

  const identities = new WeakMap<Request, AuthenticatedActor>()
  router.use(json({ limit: '16kb' }))
  router.use(async (request, response, next) => {
    if (request.method === 'POST' && request.query.actionType === 'upload') {
      if (request.get('origin') !== config.webOrigin) {
        response.status(403).json({ error: 'Untrusted upload origin' })
        return
      }
      // Resolve auth OUTSIDE Effect fibers; never read ambient request identity there.
      const session = await getSession(fromNodeHeaders(request.headers))
      if (!session) {
        response.status(401).json({ error: 'Sign in to upload photos' })
        return
      }
      identities.set(request, { userId: session.user.id, sessionId: session.session.id })
    }
    // Provider callbacks have no browser session. The SDK verifies their signature.
    next()
  })
  router.use(
    createPhotoUploadHandler(
      {
        token: storage.token,
        isDev: storage.isDev,
        callbackUrl: new URL('/api/uploadthing', config.betterAuthUrl).href,
      },
      async (request) => {
        const actor = identities.get(request)
        if (!actor) return undefined
        try {
          return await db.$transaction(async (tx) => {
            const active = await requireActiveSessionWrite(tx, actor)
            return { ...actor, authVersion: active.user.authVersion ?? 0 }
          })
        } catch (error) {
          if (error instanceof DomainError && ['UNAUTHORIZED', 'CONFLICT'].includes(error.code))
            return undefined
          throw error
        }
      },
      async (metadata, upload) => {
        // SDK-authenticated metadata, never browser input. Revocation cannot undo an
        // already-issued remote URL or bytes; it withholds useful completion only.
        if (!metadata || !Number.isInteger(metadata.authVersion) || metadata.authVersion < 0)
          return false
        try {
          return await db.$transaction(async (tx) => {
            const active = await requireActiveSessionWrite(tx, {
              userId: metadata.userId,
              sessionId: metadata.sessionId,
            })
            if ((active.user.authVersion ?? 0) !== metadata.authVersion) return false
            // Persist ownership inside the same current-session fence as completion.
            await recordUpload(tx, upload)
            return true
          })
        } catch (error) {
          if (error instanceof DomainError && ['UNAUTHORIZED', 'CONFLICT'].includes(error.code))
            return false
          throw error
        }
      },
    ),
  )
  const handleError: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    const tooLarge =
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.too.large'
    response
      .status(tooLarge ? 413 : 400)
      .json({ error: tooLarge ? 'Upload request too large' : 'Invalid upload request' })
  }
  router.use(handleError)
  return router
}
