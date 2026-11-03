import {
  SQUAD_PUSH_EVENT,
  type SquadEvent,
  squadChannelFor,
  squadPushSchema,
} from '@broke-oclock/contracts/squad'
import { api } from '@web/lib/api-client'
import type Pusher from 'pusher-js'

// The room's live channel. Every committed room write is pushed here, so taps and phase changes
// arrive at once instead of on the next poll. Pusher loads only when a room opens, shares one
// socket across rooms, and stays off when the API has no Pusher key; the room then polls.

export type ChannelHandlers = {
  onEvents: (events: SquadEvent[]) => void
  // True while subscribed on a connected socket; the room polls slowly only then.
  onLiveChange: (live: boolean) => void
}
export type RoomChannel = { close: () => void }
export type ChannelOpener = (code: string, handlers: ChannelHandlers) => RoomChannel

let client: Promise<Pusher | null> | null = null

const connect = (): Promise<Pusher | null> => {
  client ??= (async () => {
    const { pusher } = await api.squad.realtimeConfig()
    if (!pusher) return null
    const { default: PusherClient } = await import('pusher-js')
    return new PusherClient(pusher.key, {
      cluster: pusher.cluster,
      channelAuthorization: {
        customHandler: ({ socketId, channelName }, callback) => {
          api.squad
            .realtimeAuth({ socketId, channel: channelName })
            .then((signed) => callback(null, signed))
            .catch((error: unknown) =>
              callback(error instanceof Error ? error : new Error('Auth failed'), null),
            )
        },
      },
    })
  })().catch(() => {
    // A failed lookup is retried when the next room opens; this one polls.
    client = null
    return null
  })
  return client
}

export const openRoomChannel: ChannelOpener = (code, handlers) => {
  const name = squadChannelFor(code)
  let closed = false
  let live = false
  let detach = () => {}
  const setLive = (next: boolean) => {
    if (live === next || closed) return
    live = next
    handlers.onLiveChange(next)
  }

  void connect().then((pusher) => {
    if (!pusher || closed) return
    const channel = pusher.subscribe(name)
    const refresh = () => setLive(pusher.connection.state === 'connected' && channel.subscribed)
    const onPush = (data: unknown) => {
      const parsed = squadPushSchema.safeParse(data)
      if (parsed.success) handlers.onEvents(parsed.data.events)
    }
    const onError = () => setLive(false)
    channel.bind('pusher:subscription_succeeded', refresh)
    channel.bind('pusher:subscription_error', onError)
    channel.bind(SQUAD_PUSH_EVENT, onPush)
    pusher.connection.bind('state_change', refresh)
    detach = () => {
      channel.unbind('pusher:subscription_succeeded', refresh)
      channel.unbind('pusher:subscription_error', onError)
      channel.unbind(SQUAD_PUSH_EVENT, onPush)
      pusher.connection.unbind('state_change', refresh)
      pusher.unsubscribe(name)
    }
    refresh()
  })

  return {
    close: () => {
      closed = true
      detach()
    },
  }
}
