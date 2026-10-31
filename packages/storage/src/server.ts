import type { Request } from 'express'
import { createRouteHandler, createUploadthing, type FileRouter } from 'uploadthing/express'
import { UploadThingError } from 'uploadthing/server'

export { UTApi, UTFile } from 'uploadthing/server'

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
const fileLimit = { maxFileSize: '4MB', maxFileCount: 1, minFileCount: 0 } as const

export type PhotoUploadAdmission = { userId: string; sessionId: string; authVersion: number }

// What the API is told after each finished upload, so it can record who owns the file.
export type CompletedPhotoUpload = {
  userId: string
  key: string
  url: string
  mimeType: string
  sizeBytes: number
}

type CompletePhotoUpload = (
  metadata: PhotoUploadAdmission,
  upload: CompletedPhotoUpload,
) => Promise<boolean>

const createFileRouter = (
  getAdmission: (request: Request) => Promise<PhotoUploadAdmission | undefined>,
  canComplete: CompletePhotoUpload,
) => {
  const f = createUploadthing()
  return {
    photoUploader: f(
      {
        'image/jpeg': fileLimit,
        'image/png': fileLimit,
        'image/webp': fileLimit,
      },
      { awaitServerData: true },
    )
      .middleware(async ({ req, files }) => {
        const admission = await getAdmission(req)
        if (!admission)
          throw new UploadThingError({ code: 'FORBIDDEN', message: 'Sign in to upload photos' })
        if (
          files.length !== 1 ||
          files.some(
            (file) =>
              !allowedTypes.includes(file.type) || file.size <= 0 || file.size > 4 * 1024 * 1024,
          )
        ) {
          throw new UploadThingError({
            code: 'BAD_REQUEST',
            message: 'Upload one JPEG, PNG or WebP image, up to 4 MB',
          })
        }
        return admission
      })
      // The consuming API fences and persists ownership together; this package stays database-free.
      .onUploadComplete(async ({ metadata, file }) => {
        if (
          !(await canComplete(metadata, {
            userId: metadata.userId,
            key: file.key,
            url: file.ufsUrl,
            mimeType: file.type,
            sizeBytes: file.size,
          }))
        )
          return
        return { uploadedBy: metadata.userId, key: file.key, url: file.ufsUrl }
      }),
  } satisfies FileRouter
}

export type PhotoFileRouter = ReturnType<typeof createFileRouter>

export type PhotoStorageOptions = {
  token: string
  isDev: boolean
  callbackUrl: string
}

// The consuming API supplies already-authenticated, request-scoped identity.
// This package never imports an app, reads env, or authenticates sessions itself.
export const createPhotoUploadHandler = (
  options: PhotoStorageOptions,
  getAdmission: (request: Request) => Promise<PhotoUploadAdmission | undefined>,
  canComplete: CompletePhotoUpload,
) =>
  createRouteHandler({
    router: createFileRouter(getAdmission, canComplete),
    config: { ...options, logLevel: 'Error' },
  })
