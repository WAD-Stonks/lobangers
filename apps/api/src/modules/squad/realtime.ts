import type { AppConfig } from '@api/config'
import {
  SQUAD_PUSH_EVENT,
  type SquadBallot,
  type SquadEvent,
  type SquadPush,
  squadChannelFor,
} from '@broke-oclock/contracts/squad'
import Pusher from 'pusher'

// Vercel functions can't hold sockets, so Pusher does. Without Pusher, members poll the sync heartbeat.
export type SquadPublisher = {
  trigger: (channel: string, event: string, data: SquadPush) => Promise<unknown>
  authorizeChannel: (socketId: string, channel: string) => { auth: string }
}

export type WrittenEvent = { code: string; event: SquadEvent }

const PUBLISH_TIMEOUT_MS = 2_000
const EVENTS_PER_PUSH = 50

let publisher: SquadPublisher | null = null

export const setSquadPublisher = (next: SquadPublisher | null) => {
  publisher = next
}

export const configureSquadRealtime = (config: AppConfig['pusher']) =>
  setSquadPublisher(config ? new Pusher({ ...config, useTLS: true }) : null)

export const squadRealtimeEnabled = () => publisher !== null

export const authorizeSquadChannel = (socketId: string, channel: string) => {
  if (!publisher) return null
  return { auth: publisher.authorizeChannel(socketId, channel).auth }
}

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

const chunks = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )

const trigger = (target: SquadPublisher, code: string, data: SquadPush) =>
  withTimeout(target.trigger(squadChannelFor(code), SQUAD_PUSH_EVENT, data)).catch(
    (error: unknown) => {
      console.error('Squad realtime publish failed', {
        code,
        events: data.events.length,
        error: error instanceof Error ? error.message : String(error),
      })
    },
  )

export const publishBallot = async (code: string, ballot: SquadBallot) => {
  if (publisher) await trigger(publisher, code, { events: [], ballot })
}

export const publishEvents = async (written: readonly WrittenEvent[]) => {
  const target = publisher
  if (!target || written.length === 0) return
  const codes = [...new Set(written.map((entry) => entry.code))]
  const pushes = codes.flatMap((code) =>
    chunks(
      written.filter((entry) => entry.code === code).map((entry) => entry.event),
      EVENTS_PER_PUSH,
    ).map((events) => ({ code, events })),
  )
  await Promise.all(pushes.map(({ code, events }) => trigger(target, code, { events })))
}
