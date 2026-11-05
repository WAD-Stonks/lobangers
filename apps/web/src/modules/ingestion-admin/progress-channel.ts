import {
  INGESTION_PROGRESS_CHANNEL,
  INGESTION_PROGRESS_EVENT,
} from '@broke-oclock/contracts/ingestion'
import { api } from '@web/lib/api-client'

export const openImportProgressChannel = (changed: () => void, unavailable: () => void) => {
  let closed = false
  let dispose = () => {}
  void (async () => {
    const config = await api.ingestion.realtimeConfig()
    if (closed) return
    if (!config.pusher) {
      unavailable()
      return
    }
    const { default: Pusher } = await import('pusher-js')
    if (closed) return
    const client = new Pusher(config.pusher.key, {
      cluster: config.pusher.cluster,
      forceTLS: true,
      channelAuthorization: {
        customHandler: ({ socketId, channelName }, callback) => {
          if (channelName !== INGESTION_PROGRESS_CHANNEL) {
            callback(new Error('Invalid channel'), null)
            return
          }
          api.ingestion
            .realtimeAuth({ socketId, channel: INGESTION_PROGRESS_CHANNEL })
            .then((value) => {
              if (!closed) callback(null, value)
            })
            .catch(() => {
              if (!closed) callback(new Error('Progress access unavailable'), null)
            })
        },
      },
    })
    const channel = client.subscribe(INGESTION_PROGRESS_CHANNEL)
    const onChange = () => {
      if (!closed) changed()
    }
    const onError = () => {
      if (!closed) unavailable()
    }
    const connectionChanged = () => {
      if (client.connection.state !== 'connected') onError()
    }
    channel.bind(INGESTION_PROGRESS_EVENT, onChange)
    channel.bind('pusher:subscription_succeeded', onChange)
    channel.bind('pusher:subscription_error', onError)
    client.connection.bind('state_change', connectionChanged)
    dispose = () => {
      channel.unbind_all()
      client.connection.unbind('state_change', connectionChanged)
      client.unsubscribe(INGESTION_PROGRESS_CHANNEL)
      client.disconnect()
    }
  })().catch(() => {
    if (!closed) unavailable()
  })
  return () => {
    closed = true
    dispose()
  }
}
