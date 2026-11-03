import type { AppConfig } from '@api/config'
import {
  SQUAD_PUSH_EVENT,
  type SquadBallot,
  type SquadEvent,
  type SquadPush,
  squadChannelFor,
} from '@broke-oclock/contracts/squad'
import Pusher from 'pusher'

// Pushes every committed room event to the room's private Pusher channel, so members see taps
// and phase changes live instead of polling for them. Vercel functions cannot hold sockets, so
// Pusher holds them and the API only makes one HTTPS call per write. Without Pusher configured
// nothing is pushed and members fall back to polling the sync heartbeat.

export type SquadPublisher = {
  trigger: (channel: string, event: string, data: SquadPush) => Promise<unknown>
  authorizeChannel: (socketId: string, channel: string) => { auth: string }
}

export type WrittenEvent = { code: string; event: SquadEvent }

// A push that hangs must not hold the vote response; the heartbeat catches members up.
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

// A tap batch's new ballot, so the others' tallies move without anyone re-reading the room.
export const publishBallot = async (code: string, ballot: SquadBallot) => {
  if (publisher) await trigger(publisher, code, { events: [], ballot })
}

// Never throws: the write already committed, and a lost push only delays the others' view.
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
