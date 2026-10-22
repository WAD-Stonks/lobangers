import type { AppConfig } from '@api/config'
import type { ImportedImageStorage } from '@api/modules/ingestion/runtime'
import { UTApi, UTFile } from '@broke-oclock/storage/server'

// UTApi 7.7.4 uploadFiles/UTFile/customId and getFileUrls(keyType:'customId').
// The database owns upload idempotency; the SDK's custom ID is only reconciliation.
export const createImportedImageStorage = (config: AppConfig): ImportedImageStorage | undefined => {
  if (!config.photoStorage) return undefined
  const token = config.photoStorage.token
  let client: UTApi | undefined
  const api = () =>
    (client ??= new UTApi({
      token,
      logLevel: 'Error',
      fetch: (input, init) =>
        globalThis.fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }),
    }))
  return {
    upload: async (image, customId) => {
      const extension =
        { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[image.mimeType] ?? 'bin'
      const file = new UTFile(
        [new Uint8Array(image.bytes).buffer],
        `${image.sha256}.${extension}`,
        { type: image.mimeType, customId },
      )
      const result = await api().uploadFiles(file, {
        acl: 'public-read',
        contentDisposition: 'inline',
      })
      if (!result.data || result.error || result.data.size !== image.byteLength)
        throw new Error('IMAGE_UPLOAD_FAILED')
      return { key: result.data.key, url: result.data.ufsUrl }
    },
    resolve: async (customId) => {
      const result = await api().getFileUrls(customId, { keyType: 'customId' })
      if (result.data.length !== 1) return null
      const file = result.data[0]
      return file ? { key: file.key, url: file.url } : null
    },
  }
}
