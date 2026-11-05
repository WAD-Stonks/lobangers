import type { AppConfig } from '@api/config'
import {
  FLASH_DROP_CHANGED_EVENT,
  FLASH_DROPS_CHANNEL,
  type FlashDropChange,
  merchantFlashChannelFor,
} from '@broke-oclock/contracts/flash-drops'
import Pusher from 'pusher'

export type FlashPublisher = {
  trigger: (channels: string[], event: string, data: FlashDropChange) => Promise<unknown>
  authorizeChannel: (socketId: string, channel: string) => { auth: string }
}

const PUBLISH_TIMEOUT_MS = 2_000

let publisher: FlashPublisher | null = null

export const setFlashPublisher = (next: FlashPublisher | null) => {
  publisher = next
}

export const configureFlashRealtime = (config: AppConfig['pusher']) =>
  setFlashPublisher(config ? new Pusher({ ...config, useTLS: true }) : null)

export const authorizeMerchantFlashChannel = (socketId: string, userId: string) =>
  publisher?.authorizeChannel(socketId, merchantFlashChannelFor(userId)) ?? null

const withTimeout = async (work: Promise<unknown>) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Pusher publish timed out')), PUBLISH_TIMEOUT_MS)
  })
  try {
    await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export const publishFlashChange = async (merchantUserId: string, change: FlashDropChange) => {
  const target = publisher
  if (!target) return
  try {
    await withTimeout(
      target.trigger(
        [FLASH_DROPS_CHANNEL, merchantFlashChannelFor(merchantUserId)],
        FLASH_DROP_CHANGED_EVENT,
        change,
      ),
    )
  } catch (error) {
    console.error('Flash realtime publish failed', {
      dropId: change.dropId,
      kind: change.kind,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
