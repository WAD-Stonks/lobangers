import { ref } from 'vue'

export type NoticeTone = 'success' | 'error'
export type MerchantNotice = { tone: NoticeTone; text: string }

const pending = ref<MerchantNotice | null>(null)

export const leaveMerchantNotice = (notice: MerchantNotice) => {
  pending.value = notice
}

export const takeMerchantNotice = (): MerchantNotice | null => {
  const notice = pending.value
  pending.value = null
  return notice
}
