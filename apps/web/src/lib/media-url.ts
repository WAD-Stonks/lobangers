// Imported media must use hosted HTTPS URLs, never active schemes or credentialed URLs.
export const safeMediaUrl = (value: string | null | undefined): string | null => {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

export const supportedImageMime = (mime: string) =>
  ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(mime)
