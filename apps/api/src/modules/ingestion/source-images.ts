import { createHash, randomUUID } from 'node:crypto'
import type { FetchedSourceImage, IngestionRuntime } from '@api/modules/ingestion/runtime'
import type { SourceDefinition } from '@api/modules/ingestion/source'
import type { SourcePost } from '@api/modules/ingestion/source-post'
import type { db } from '@broke-oclock/db'

export type CapturedImage = {
  imageId: string
  sourceUrl: string
  finalUrl: string
  altText?: string
}
const hosted = (value: { key: string; url: string }) => {
  const url = new URL(value.url)
  if (
    !value.key ||
    value.key.length > 512 ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !(['utfs.io', 'uploadthing.com'].includes(url.hostname) || url.hostname.endsWith('.ufs.sh'))
  )
    throw new Error('INVALID_STORAGE_RECEIPT')
  return value
}
const validateBytes = (value: FetchedSourceImage) => {
  if (
    !(value.bytes instanceof Uint8Array) ||
    value.byteLength !== value.bytes.length ||
    value.byteLength < 1 ||
    value.byteLength > 4 * 1024 * 1024 ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(value.mimeType) ||
    createHash('sha256').update(value.bytes).digest('hex') !== value.sha256
  )
    throw new Error('INVALID_IMAGE_BYTES')
}
const storeImage = async (
  database: typeof db,
  runtime: IngestionRuntime,
  image: FetchedSourceImage,
) => {
  validateBytes(image)
  const id = image.sha256
  let row = await database.importedImage.findUnique({ where: { id } })
  if (!row) {
    try {
      row = await database.importedImage.create({
        data: {
          id,
          mimeType: image.mimeType,
          sizeBytes: image.byteLength,
          status: 'DOWNLOADED_ONLY',
        },
      })
    } catch (error) {
      if (!(typeof error === 'object' && error && 'code' in error && error.code === 'P2002'))
        throw error
      row = await database.importedImage.findUniqueOrThrow({ where: { id } })
    }
  }
  if (row.sizeBytes !== image.byteLength || row.mimeType !== image.mimeType)
    throw new Error('IMAGE_IDENTITY_CONFLICT')
  if (row.status === 'HOSTED' || !runtime.imageStorage) return id
  const customId = `lobangers-image-v1-${id}`
  if (
    row.status === 'UNKNOWN' ||
    (row.status === 'UPLOADING' && row.uploadExpiresAt && row.uploadExpiresAt <= runtime.now())
  ) {
    // An expired/uncertain upload is NOT permission to resend. A custom ID is a
    // lookup key, not a provider uniqueness guarantee. Absence stays UNKNOWN.
    const receipt = await runtime.imageStorage.resolve(customId)
    if (receipt) {
      const resolved = hosted(receipt)
      await database.importedImage.updateMany({
        where: { id, status: row.status, uploadToken: row.uploadToken },
        data: {
          status: 'HOSTED',
          storageKey: resolved.key,
          hostedUrl: resolved.url,
          uploadToken: null,
          uploadExpiresAt: null,
          errorCode: null,
        },
      })
    } else {
      await database.importedImage.updateMany({
        where: { id, status: row.status, uploadToken: row.uploadToken },
        data: { status: 'UNKNOWN', errorCode: 'UPLOAD_OUTCOME_UNKNOWN' },
      })
    }
    return id
  }
  if (row.status !== 'DOWNLOADED_ONLY') return id
  const token = randomUUID()
  const claimed = await database.importedImage.updateMany({
    where: { id, status: 'DOWNLOADED_ONLY' },
    data: {
      status: 'UPLOADING',
      uploadToken: token,
      uploadExpiresAt: new Date(runtime.now().getTime() + 120_000),
    },
  })
  if (claimed.count !== 1) return id
  try {
    const receipt = hosted(await runtime.imageStorage.upload(image, customId))
    await database.importedImage.updateMany({
      where: { id, uploadToken: token, status: 'UPLOADING' },
      data: {
        status: 'HOSTED',
        storageKey: receipt.key,
        hostedUrl: receipt.url,
        uploadToken: null,
        uploadExpiresAt: null,
        errorCode: null,
      },
    })
  } catch {
    await database.importedImage.updateMany({
      where: { id, uploadToken: token, status: 'UPLOADING' },
      data: { status: 'UNKNOWN', errorCode: 'UPLOAD_OUTCOME_UNKNOWN' },
    })
  }
  return id
}
export const captureSourceImages = async (
  database: typeof db,
  runtime: IngestionRuntime,
  source: SourceDefinition,
  images: SourcePost['images'],
  fence: () => Promise<void>,
) => {
  const captured = new Map<string, CapturedImage>()
  if (!runtime.fetchImage) return []
  for (const image of images.slice(0, 5)) {
    await fence()
    const fetched = await runtime.fetchImage(image.url, { source: source.kind })
    await fence()
    const imageId = await storeImage(database, runtime, fetched)
    captured.set(imageId, {
      imageId,
      sourceUrl: fetched.url,
      finalUrl: fetched.finalUrl,
      ...(image.altText ? { altText: image.altText } : {}),
    })
  }
  return [...captured.values()]
}
export const imageLinks = (images: CapturedImage[]) => ({
  create: images.map(({ imageId, ...metadata }) => ({
    ...metadata,
    image: { connect: { id: imageId } },
  })),
})
