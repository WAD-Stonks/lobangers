import {
  FLASH_DROP_CHANGED_EVENT,
  FLASH_DROPS_CHANNEL,
  type FlashDropChange,
  flashDropChangeSchema,
  merchantFlashChannelFor,
  merchantFlashChannelPattern,
} from '@broke-oclock/contracts/flash-drops'
import { api } from '@web/lib/api-client'
import type Pusher from 'pusher-js'

// Live flash deal updates. The API pushes "this drop changed" when one goes live, is claimed,
// ends or is removed; the map listens on the public channel and the merchant dashboard on the
// merchant's own private one. A push carries no deal data, so listeners re-read through the REST
// API. Pusher loads only when a channel opens, one socket serves every channel, and when the API
// has no Pusher key nothing connects and the listeners keep polling.

export type FlashChannelHandlers = {
  onChange: (change: FlashDropChange) => void
  // True while subscribed on a connected socket. Going live again after a drop-out is the time
  // to re-read, since pushes sent while offline are lost.
  onLiveChange?: (live: boolean) => void
}
export type CloseChannel = () => void

let client: Promise<Pusher | null> | null = null

const connect = (): Promise<Pusher | null> => {
  client ??= (async () => {
    const { pusher } = await api.flashDrops.realtimeConfig()
    if (!pusher) return null
    const { default: PusherClient } = await import('pusher-js')
    return new PusherClient(pusher.key, {
      cluster: pusher.cluster,
      forceTLS: true,
      channelAuthorization: {
        customHandler: ({ socketId, channelName }, callback) => {
          // Only the merchant channel is private; never sign anything else.
          if (!merchantFlashChannelPattern.test(channelName)) {
            callback(new Error('Invalid channel'), null)
            return
          }
          api.flashDrops.merchant
            .realtimeAuth({ socketId, channel: channelName })
            .then((signed) => callback(null, signed))
            .catch((error: unknown) =>
              callback(error instanceof Error ? error : new Error('Auth failed'), null),
            )
        },
      },
    })
  })().catch((error: unknown) => {
    // Retried when the next channel opens; until then everyone polls.
    console.error('Could not connect to live flash updates', error)
    client = null
    return null
  })
  return client
}

const openChannel = (name: string, handlers: FlashChannelHandlers): CloseChannel => {
  let closed = false
  let live = false
  let detach = () => {}
  const setLive = (next: boolean) => {
    if (live === next || closed) return
    live = next
    handlers.onLiveChange?.(next)
  }

  void connect().then((pusher) => {
    if (!pusher || closed) return
    const channel = pusher.subscribe(name)
    const refresh = () => setLive(pusher.connection.state === 'connected' && channel.subscribed)
    const onPush = (data: unknown) => {
      const parsed = flashDropChangeSchema.safeParse(data)
      if (parsed.success && !closed) handlers.onChange(parsed.data)
    }
    const onError = () => setLive(false)
    channel.bind('pusher:subscription_succeeded', refresh)
    channel.bind('pusher:subscription_error', onError)
    channel.bind(FLASH_DROP_CHANGED_EVENT, onPush)
    pusher.connection.bind('state_change', refresh)
    detach = () => {
      channel.unbind('pusher:subscription_succeeded', refresh)
      channel.unbind('pusher:subscription_error', onError)
      channel.unbind(FLASH_DROP_CHANGED_EVENT, onPush)
      pusher.connection.unbind('state_change', refresh)
      pusher.unsubscribe(name)
    }
    refresh()
  })

  return () => {
    closed = true
    detach()
  }
}

export const openMapFlashChannel = (handlers: FlashChannelHandlers) =>
  openChannel(FLASH_DROPS_CHANNEL, handlers)

export const openMerchantFlashChannel = (userId: string, handlers: FlashChannelHandlers) =>
  openChannel(merchantFlashChannelFor(userId), handlers)

// Runs `work` straight away, then at most once more per `ms` however many calls arrive, so a
// crowd claiming at once costs each browser one re-read a second, not one per claim.
export const coalesce = (work: () => void, ms: number) => {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending = false
  const run = () => {
    timer = null
    if (!pending) return
    pending = false
    work()
    timer = setTimeout(run, ms)
  }
  const call = () => {
    pending = true
    if (!timer) run()
  }
  call.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
    pending = false
  }
  return call
}
