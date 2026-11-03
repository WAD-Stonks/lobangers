import type { AppConfig } from '@api/config'
import {
  INGESTION_PROGRESS_CHANNEL,
  INGESTION_PROGRESS_EVENT,
} from '@broke-oclock/contracts/ingestion'
import Pusher from 'pusher'

// Same Pusher application as Squad. No source details or privileged data travel
// over the channel: notifications only invalidate an authenticated REST read.
export type Publisher = {
  trigger: (channel: string, event: string, data: object) => Promise<unknown>
  authorizeChannel: (socketId: string, channel: string) => { auth: string }
}
let publisher: Publisher | null = null
let lastPublished = 0
export const setIngestionPublisher = (value: Publisher | null) => {
  publisher = value
  lastPublished = 0
}
export const configureIngestionRealtime = (config: AppConfig['pusher']) =>
  setIngestionPublisher(config ? new Pusher({ ...config, useTLS: true }) : null)
export const authorizeIngestionChannel = (socketId: string) =>
  publisher?.authorizeChannel(socketId, INGESTION_PROGRESS_CHANNEL) ?? null

export const publishIngestionProgress = async (force = false) => {
  const target = publisher
  if (!target || (!force && Date.now() - lastPublished < 500)) return
  lastPublished = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      target.trigger(INGESTION_PROGRESS_CHANNEL, INGESTION_PROGRESS_EVENT, {}),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Publish timeout')), 2000)
      }),
    ])
  } catch {
    // Persistence is authoritative. Do not fail/replay a committed import when
    // Pusher is unavailable, and do not log credentials/provider diagnostics.
    console.warn('Ingestion progress notification unavailable')
  } finally {
    clearTimeout(timer)
  }
}
