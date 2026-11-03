import { dealShareMessage } from '@broke-oclock/contracts/deal-copy'

// What a shared deal sends: its picture, then its name, outlet, dates and a link to its own page
// at the outlet it was shared from. The server words chat link previews the same way.
export type DealShare = { title: string; venueName: string; dates: string | null; url: string }

export const dealShareText = dealShareMessage

// Chat apps open their own share screens from these links. They carry text only; the picture
// comes from the link's preview card.
export const whatsAppShareUrl = (share: DealShare) =>
  `https://wa.me/?text=${encodeURIComponent(dealShareText(share))}`

// Telegram sets its url field above the text, so the whole message goes in that field instead and
// the link inside it shows once.
export const telegramShareUrl = (share: DealShare) =>
  `https://t.me/share/url?url=${encodeURIComponent(dealShareText(share))}`

// The deal photo as a file a share sheet can attach. Fetched ahead of the tap, because the share
// sheet only opens straight after one; null when the host won't hand the image over.
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

// The device's own share sheet, with the photo first where the sheet takes files; reports
// 'unsupported' where there is none. The link is already in the message, so there is no separate
// url field for apps to add a second time.
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
    // Closing the share sheet is not a failure worth shouting about.
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
