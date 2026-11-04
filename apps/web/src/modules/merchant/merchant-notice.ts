import { ref } from 'vue'

// A message for the merchant dashboard to show once, such as "… is now live." after the deal form
// saves and sends the merchant back. Kept in memory only: a refresh simply drops it.
export type NoticeTone = 'success' | 'error'
export type MerchantNotice = { tone: NoticeTone; text: string }

const pending = ref<MerchantNotice | null>(null)

export const leaveMerchantNotice = (notice: MerchantNotice) => {
  pending.value = notice
}

// Hands over the waiting message, if any, and forgets it.
export const takeMerchantNotice = (): MerchantNotice | null => {
  const notice = pending.value
  pending.value = null
  return notice
}
