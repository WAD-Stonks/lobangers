import type { Request } from 'express'
import { createRouteHandler, createUploadthing, type FileRouter } from 'uploadthing/express'
import { UploadThingError } from 'uploadthing/server'

export { UTApi, UTFile } from 'uploadthing/server'

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
const fileLimit = { maxFileSize: '4MB', maxFileCount: 1, minFileCount: 0 } as const

// What the API is told after each finished upload, so it can record who owns the file.
export type CompletedPhotoUpload = {
  userId: string
  key: string
  url: string
  mimeType: string
  sizeBytes: number
}
type OnPhotoUploaded = (upload: CompletedPhotoUpload) => Promise<void>

const createFileRouter = (
  getUserId: (request: Request) => string | undefined,
  onUploaded?: OnPhotoUploaded,
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
      .middleware(({ req, files }) => {
        const userId = getUserId(req)
        if (!userId)
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
        return { userId }
      })
      // The consuming API persists ownership through onUploaded; this package stays database-free.
      .onUploadComplete(async ({ metadata, file }) => {
        await onUploaded?.({
          userId: metadata.userId,
          key: file.key,
          url: file.ufsUrl,
          mimeType: file.type,
          sizeBytes: file.size,
        })
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
  getUserId: (request: Request) => string | undefined,
  onUploaded?: OnPhotoUploaded,
) =>
  createRouteHandler({
    router: createFileRouter(getUserId, onUploaded),
    config: { ...options, logLevel: 'Error' },
  })
