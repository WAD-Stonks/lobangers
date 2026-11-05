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

export type FlashChannelHandlers = {
  onChange: (change: FlashDropChange) => void
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
