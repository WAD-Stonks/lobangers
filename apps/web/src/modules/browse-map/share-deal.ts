import { dealShareMessage } from '@broke-oclock/contracts/deal-copy'

export type DealShare = { title: string; venueName: string; dates: string | null; url: string }

export const dealShareText = dealShareMessage

export const whatsAppShareUrl = (share: DealShare) =>
  `https://wa.me/?text=${encodeURIComponent(dealShareText(share))}`

export const telegramShareUrl = (share: DealShare) =>
  `https://t.me/share/url?url=${encodeURIComponent(dealShareText(share))}`

export const dealImageFile = async (imageUrl: string): Promise<File | null> => {
  try {
    const response = await fetch(imageUrl)
    if (!response.ok) return null
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) return null
    const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
    return new File([blob], `deal.${extension}`, { type: blob.type })
  } catch {
    return null
  }
}

export const shareNatively = async (
  share: DealShare,
  image: File | null = null,
): Promise<'shared' | 'unsupported' | 'failed'> => {
  if (typeof navigator.share !== 'function') return 'unsupported'
  const text = dealShareText(share)
  const withImage = image && navigator.canShare?.({ files: [image] })
  try {
    await navigator.share(withImage ? { files: [image], text } : { text })
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'shared'
    return 'failed'
  }
}

export const copyDealLink = async (url: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(url)
    return true
  } catch {
    return false
  }
}
