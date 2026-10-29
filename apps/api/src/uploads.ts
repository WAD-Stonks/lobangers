import type { AppConfig } from '@api/config'
import { fromNodeHeaders } from '@broke-oclock/auth/node'
import { db } from '@broke-oclock/db'
import { type CompletedPhotoUpload, createPhotoUploadHandler } from '@broke-oclock/storage/server'
import { type ErrorRequestHandler, json, type Request, Router } from 'express'

type UploadSession = { user: { id: string } } | null
type GetSession = (headers: Headers) => Promise<UploadSession>

// Record who uploaded each photo, so a deal can later attach only its own submitter's file.
// The provider may repeat a callback; the first owner of a key is kept.
const recordUpload = async (upload: CompletedPhotoUpload) => {
  await db.uploadedFile.upsert({
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

  const identities = new WeakMap<Request, string>()
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
      identities.set(request, session.user.id)
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
      (request) => identities.get(request),
      recordUpload,
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
