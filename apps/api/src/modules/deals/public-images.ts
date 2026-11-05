import {
  type ImageSource,
  imagesFor,
  MAX_IMAGE_SOURCES,
  MAX_SOURCE_IMAGES,
} from '@api/modules/deals/deal-images'

const sourceOrder = [{ createdAt: 'asc' as const }, { id: 'asc' as const }]

export const publicImportedImageSelect = {
  take: MAX_IMAGE_SOURCES,
  orderBy: sourceOrder,
  select: {
    importedPost: { select: { rawContent: true } },
    images: {
      take: MAX_SOURCE_IMAGES,
      orderBy: { id: 'asc' },
      select: {
        sourceUrl: true,
        altText: true,
        image: { select: { hostedUrl: true, status: true, mimeType: true } },
      },
    },
  },
} as const

export const publicImportedImage = (deal: { sources: readonly ImageSource[] }) => {
  const candidate = imagesFor(deal)[0]
  return {
    imageUrl: candidate?.url ?? null,
    ...(candidate?.alt ? { imageAltText: candidate.alt } : {}),
  }
}
