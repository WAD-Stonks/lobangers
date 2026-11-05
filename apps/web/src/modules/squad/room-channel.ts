import {
  SQUAD_PUSH_EVENT,
  SQUAD_TAP_EVENT,
  type SquadBallot,
  type SquadEvent,
  type SquadTap,
  squadChannelFor,
  squadPushSchema,
  squadTapSchema,
} from '@broke-oclock/contracts/squad'
import { api } from '@web/lib/api-client'
import type Pusher from 'pusher-js'

export type ChannelHandlers = {
  onEvents: (events: SquadEvent[]) => void
  onBallot: (ballot: SquadBallot) => void
  onTaps: (tap: SquadTap) => void
  onLiveChange: (live: boolean) => void
}
export type RoomChannel = { close: () => void; sendTaps: (tap: SquadTap) => boolean }
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
  let send: (tap: SquadTap) => boolean = () => false
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
      if (!parsed.success) return
      if (parsed.data.events.length > 0) handlers.onEvents(parsed.data.events)
      if (parsed.data.ballot) handlers.onBallot(parsed.data.ballot)
    }
    const onTaps = (data: unknown) => {
      const parsed = squadTapSchema.safeParse(data)
      if (parsed.success) handlers.onTaps(parsed.data)
    }
    const onError = () => setLive(false)
    channel.bind('pusher:subscription_succeeded', refresh)
    channel.bind('pusher:subscription_error', onError)
    channel.bind(SQUAD_PUSH_EVENT, onPush)
    channel.bind(SQUAD_TAP_EVENT, onTaps)
    pusher.connection.bind('state_change', refresh)
    send = (tap) => live && channel.trigger(SQUAD_TAP_EVENT, tap)
    detach = () => {
      send = () => false
      channel.unbind(SQUAD_TAP_EVENT, onTaps)
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
    sendTaps: (tap) => send(tap),
  }
}
