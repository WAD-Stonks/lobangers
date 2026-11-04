import type { PhotoFileRouter } from '@storage/types'
import { genUploader } from 'uploadthing/client'

// Type-only server contract: no server/auth/database implementation enters the browser.
const { uploadFiles } = genUploader<PhotoFileRouter>({ url: '/api/uploadthing' })
type UploadOptions = Parameters<typeof uploadFiles<'photoUploader'>>[1]

export const PHOTO_UPLOAD_TIMEOUT_MS = 60_000

export const uploadPhoto = async (
  file: File,
  options: Pick<UploadOptions, 'signal' | 'onUploadProgress'> = {},
) => {
  const timeout = new AbortController()
  const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timeout.abort()
      reject(new Error('Photo upload timed out'))
    }, PHOTO_UPLOAD_TIMEOUT_MS)
  })
  const [photo] = await Promise.race([
    uploadFiles('photoUploader', { ...options, signal, files: [file] }),
    timedOut,
  ]).finally(() => clearTimeout(timer))
  if (!photo) throw new Error('No photo was uploaded')
  if (!photo.serverData) throw new Error('Upload completion not authorized')
  return {
    key: photo.key,
    url: photo.ufsUrl,
    uploadedBy: photo.serverData.uploadedBy,
  }
}
