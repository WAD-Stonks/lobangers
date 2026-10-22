import type { DealImage } from '@broke-oclock/contracts/deals'

// A deal's gallery; some roundup posts carry 70+ images, which the panel has no use for.
export const MAX_DEAL_IMAGES = 6
export const MAX_IMAGE_SOURCES = 5
export const MAX_SOURCE_IMAGES = 5
const HOSTED_IMAGE_STATUS = 'HOSTED'
// The channel's own "join us on Telegram" banner, and screenshots of tables or comments,
// are never the photo a deal should lead with.
const NON_HERO_NAME = /telegram|screenshot/i
const IMG_SRC = /<img\b[^>]*?\bsrc="([^"]+)"/gi
// WordPress serves resized copies (photo-1024x768.jpg) and big-image copies (photo-scaled.jpg).
const WORDPRESS_VARIANT = /-(?:\d+x\d+|scaled)(?=\.[a-z0-9]+$)/

export type SourceImageRow = {
  sourceUrl: string
  altText: string | null
  image: { status: string; hostedUrl: string | null; mimeType: string } | null
}

export type ImageSource = {
  importedPost: { rawContent: string } | null
  images: readonly SourceImageRow[]
}

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

// One key for every copy of an image file, however the article and the importer spelled it.
const imageKey = (url: string): string => {
  const path = decode(url).split(/[?#]/)[0] ?? ''
  const name = path.split('/').pop() ?? ''
  return name.toLowerCase().replace(WORDPRESS_VARIANT, '')
}

// Archive reads accept already hosted raster formats independently of downloader limits.
const toImage = (row: SourceImageRow): DealImage[] => {
  const image = row.image
  if (
    !image ||
    image.status !== HOSTED_IMAGE_STATUS ||
    !image.hostedUrl ||
    !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(image.mimeType)
  )
    return []
  try {
    const url = new URL(image.hostedUrl)
    if (url.protocol !== 'https:' || url.username || url.password) return []
    return [{ url: image.hostedUrl, alt: row.altText?.trim() || null }]
  } catch {
    return []
  }
}

// Article sources (HTML) carry every inline image: tables, reader photos, banners. Only the
// first content image on the page is the hero. Telegram sources hold just the post's photos.
const pickFromSource = (source: ImageSource): readonly SourceImageRow[] => {
  // Telegram posts are stored as a JSON projection; articles as their HTML body.
  const html = source.importedPost?.rawContent ?? ''
  if (!html.trimStart().startsWith('<')) return source.images

  const candidates = source.images.filter((row) => !NON_HERO_NAME.test(imageKey(row.sourceUrl)))
  const pageOrder = [...html.matchAll(IMG_SRC)].map((match) => imageKey(match[1] ?? ''))
  const position = (row: SourceImageRow) => {
    const index = pageOrder.indexOf(imageKey(row.sourceUrl))
    return index === -1 ? Number.POSITIVE_INFINITY : index
  }
  const [hero] = [...candidates].sort((a, b) => position(a) - position(b))
  return hero ? [hero] : []
}

// Hosted images worth showing for a deal, deduplicated and capped. Anything not yet hosted,
// or not served over https, is left out rather than shown broken.
export const imagesFor = (deal: { sources: readonly ImageSource[] }): DealImage[] => {
  const usable = deal.sources
    .slice(0, MAX_IMAGE_SOURCES)
    .flatMap((source) =>
      pickFromSource({ ...source, images: source.images.slice(0, MAX_SOURCE_IMAGES) }),
    )
    .flatMap(toImage)
  const unique = [...new Map(usable.map((image) => [image.url, image])).values()]
  return unique.slice(0, MAX_DEAL_IMAGES)
}
