import type { AppConfig } from '@api/config'
import {
  FLASH_DROP_CHANGED_EVENT,
  FLASH_DROPS_CHANNEL,
  type FlashDropChange,
  merchantFlashChannelFor,
} from '@broke-oclock/contracts/flash-drops'
import Pusher from 'pusher'

// Pushes "this flash deal changed" to the public map channel and to the merchant's own private
// channel, so visitors see drops appear, sell down and end at once, and merchants watch claims
// come in live. Same Pusher application as Squad. A push carries only the drop id and what
// happened; browsers re-read through the REST API, so nothing private travels over it. Without
// Pusher configured nothing is pushed and both sides keep polling.

export type FlashPublisher = {
  trigger: (channels: string[], event: string, data: FlashDropChange) => Promise<unknown>
  authorizeChannel: (socketId: string, channel: string) => { auth: string }
}

// A push that hangs must not hold the response; polling catches everyone up.
const PUBLISH_TIMEOUT_MS = 2_000

let publisher: FlashPublisher | null = null

export const setFlashPublisher = (next: FlashPublisher | null) => {
  publisher = next
}

export const configureFlashRealtime = (config: AppConfig['pusher']) =>
  setFlashPublisher(config ? new Pusher({ ...config, useTLS: true }) : null)

// Signs a merchant's socket into their own channel only; the caller has checked who they are.
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

// Never throws: the write already committed, and a lost push only delays the others' view.
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
