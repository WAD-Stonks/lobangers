import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const origin = 'http://localhost:5173'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let baseURL = ''

type Account = { id: string; cookie: string }
let host: Account
let ashley: Account
let damien: Account
let noah: Account
let late: Account

type Push = {
  channel: string
  event: string
  data: { events: { kind: string }[]; ballot?: { stance: string; yays: number } }
}
const pushes: Push[] = []
let realtime: typeof import('@api/modules/squad/realtime')
const fakePusher = {
  trigger: async (channel: string, event: string, data: Push['data']) => {
    pushes.push({ channel, event, data })
  },
  authorizeChannel: (socketId: string, channel: string) => ({
    auth: `synthetic:${socketId}:${channel}`,
  }),
}

let signUps = 1
const signUp = async (name: string): Promise<Account> => {
  const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      'X-Forwarded-For': `10.${signUps >> 8}.${signUps++ & 255}.1`,
    },
    body: JSON.stringify({
      name,
      email: `squad-${randomUUID()}@example.test`,
      password: randomBytes(24).toString('base64url'),
    }),
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  return { id: body.user.id as string, cookie }
}

const call = async (account: Account | null, method: string, path: string, body?: unknown) => {
  const response = await fetch(`${baseURL}/api${path}`, {
    method,
    headers: {
      ...(account ? { Cookie: account.cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      Origin: origin,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

const publishedDeal = async (title: string, validUntil: Date | null = null) => {
  const brand = await db.merchant.create({ data: { name: `Synthetic ${title} brand` } })
  const venue = await db.venue.create({
    data: {
      merchantId: brand.id,
      name: `Synthetic ${title} stall`,
      address: '1 Synthetic Road',
      latitude: 1.32,
      longitude: 103.93,
    },
  })
  const deal = await db.deal.create({
    data: {
      title: `Synthetic ${title}`,
      description: 'Fake deal for a squad test.',
      category: 'FOOD',
      offerType: 'FIXED_PRICE',
      priceMinor: 350,
      applicability: 'SELECTED_OUTLETS',
      reviewStatus: 'APPROVED',
      publishedAt: new Date(),
      validUntil,
      merchantId: brand.id,
      venues: { create: [{ venueId: venue.id }] },
    },
  })
  return deal.id
}

const room = (code: string, action = '') => `/squad/rooms/${code}${action}`
const join = (account: Account, code: string, displayName: string, avatar = 'teh') =>
  call(account, 'POST', room(code, '/join'), { displayName, avatar })
const voteAs = (account: Account, code: string, stance: 'YAY' | 'NAH', taps = 1) =>
  call(account, 'POST', room(code, '/votes'), { stance, taps })
const chooseAs = (account: Account, code: string, choice: 'AGAIN' | 'NEXT') =>
  call(account, 'POST', room(code, '/choices'), { choice })

const liveRoom = async (dealIds: string[], capacity = 4) => {
  const created = await call(host, 'POST', '/squad/rooms', {
    dealIds,
    capacity,
    displayName: 'Allison',
    avatar: 'kopi',
  })
  expect(created.status).toBe(201)
  const code = created.body.code as string
  expect((await join(ashley, code, 'Ashley', 'bao')).status).toBe(200)
  expect((await join(damien, code, 'Damien', 'kaya')).status).toBe(200)
  expect((await call(host, 'POST', room(code, '/start'))).status).toBe(200)
  return code
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`squad_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await promisify(execFile)('pnpm', ['--dir', 'packages/db', 'run', 'push'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    timeout: 60_000,
    shell: process.platform === 'win32',
  })
  db = (await import('@broke-oclock/db')).db
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing disposable HTTP listener')
  baseURL = `http://127.0.0.1:${address.port}`
  server.on(
    'request',
    createApp(
      parseConfig({
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
        BETTER_AUTH_URL: baseURL,
        WEB_ORIGIN: origin,
      }),
    ),
  )
  realtime = await import('@api/modules/squad/realtime')
  host = await signUp('Synthetic host')
  ashley = await signUp('Synthetic Ashley')
  damien = await signUp('Synthetic Damien')
  noah = await signUp('Synthetic Noah')
  late = await signUp('Synthetic late')
}, 180_000)

afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})

describe('lobby', () => {
  it('hosts a room with a four-letter code and only votable deals', async () => {
    const ended = await publishedDeal('Ended', new Date(Date.now() - 60_000))
    const fine = await publishedDeal('Lobby')
    expect(
      (
        await call(null, 'POST', '/squad/rooms', {
          dealIds: [fine],
          capacity: 4,
          displayName: 'A',
          avatar: 'kopi',
        })
      ).status,
    ).toBe(401)
    const refused = await call(host, 'POST', '/squad/rooms', {
      dealIds: [ended],
      capacity: 4,
      displayName: 'Allison',
      avatar: 'kopi',
    })
    expect(refused.status).toBe(400)
    const created = await call(host, 'POST', '/squad/rooms', {
      dealIds: [fine],
      capacity: 2,
      displayName: 'Allison',
      avatar: 'kopi',
    })
    expect(created.body).toMatchObject({
      status: 'LOBBY',
      capacity: 2,
      me: { isHost: true, spectator: false },
    })
    expect(created.body.code).toMatch(/^[A-Z]{4}$/)
    const peek = await call(noah, 'GET', room(created.body.code))
    expect(peek.body).toMatchObject({
      status: 'LOBBY',
      members: 1,
      hostName: 'Allison',
      capacity: 2,
    })
  })

  it('explains taken names, full rooms, wrong codes and starting alone', async () => {
    const deal = await publishedDeal('Rules')
    const created = await call(host, 'POST', '/squad/rooms', {
      dealIds: [deal],
      capacity: 2,
      displayName: 'Allison',
      avatar: 'kopi',
    })
    const code = created.body.code as string
    expect((await call(host, 'POST', room(code, '/start'))).status).toBe(412)
    const taken = await join(ashley, code, ' allison ')
    expect(taken.status).toBe(409)
    expect(taken.body.error.message).toMatch(/already called Allison/)
    expect((await join(ashley, code, 'Ashley')).status).toBe(200)
    const full = await join(damien, code, 'Damien')
    expect(full.status).toBe(409)
    expect(full.body.error.message).toMatch(/full \(2 of 2\)/)
    expect((await call(noah, 'GET', room('ZZZZ'))).status).toBe(404)
    expect((await join(ashley, code, 'Ashley')).body.me.isHost).toBe(false)
    expect((await call(ashley, 'POST', room(code, '/start'))).status).toBe(403)
  })

  it('removes a member, who cannot come back, and closes for everyone', async () => {
    const deal = await publishedDeal('Kick')
    const created = await call(host, 'POST', '/squad/rooms', {
      dealIds: [deal],
      capacity: 4,
      displayName: 'Allison',
      avatar: 'kopi',
    })
    const code = created.body.code as string
    const joined = await join(noah, code, 'Noah')
    const noahId = joined.body.me.memberId
    expect((await call(host, 'POST', room(code, `/members/${noahId}/remove`))).status).toBe(200)
    expect((await join(noah, code, 'Noah')).status).toBe(403)
    const synced = await call(noah, 'POST', room(code, '/sync'), { after: 0 })
    expect(synced.body.state.me.kicked).toBe(true)
    expect((await call(host, 'POST', room(code, '/close'))).body).toMatchObject({
      status: 'CLOSED',
      closeReason: 'HOST_CLOSED',
    })
    expect((await join(late, code, 'Late')).status).toBe(412)
  })
})

describe('voting', () => {
  it('matches when more than half say yay, and replays every tap as an effect', async () => {
    const code = await liveRoom([await publishedDeal('Match')])
    await voteAs(host, code, 'YAY', 5)
    const after = await voteAs(ashley, code, 'YAY')
    expect(after.body.phase).toBe('MATCHED')
    expect(after.body.matchDealId).toBe(after.body.deals[0].id)
    const synced = await call(damien, 'POST', room(code, '/sync'), { after: 0 })
    const kinds = synced.body.events.map((event: { kind: string }) => event.kind)
    expect(kinds.filter((kind: string) => kind === 'YAY')).toHaveLength(4)
    expect(kinds.at(-1)).toBe('MATCH')
    expect(
      synced.body.state.members.find((member: { name: string }) => member.name === 'Allison').yays,
    ).toBe(5)
  })

  it('decides together: vote again needs a majority, otherwise the next deal', async () => {
    const code = await liveRoom([await publishedDeal('First'), await publishedDeal('Second')])
    await voteAs(host, code, 'YAY')
    await voteAs(ashley, code, 'NAH')
    const decided = await voteAs(damien, code, 'NAH')
    expect(decided.body).toMatchObject({
      phase: 'DECIDING',
      tally: { yesPeople: 1, voters: 3, voted: 3 },
    })
    expect((await voteAs(host, code, 'YAY')).status).toBe(412)
    await chooseAs(host, code, 'AGAIN')
    await chooseAs(ashley, code, 'AGAIN')
    const revote = await chooseAs(damien, code, 'NEXT')
    expect(revote.body).toMatchObject({ phase: 'VOTING', round: 1, dealIndex: 0 })
    for (const person of [host, ashley, damien]) await voteAs(person, code, 'NAH')
    await chooseAs(host, code, 'AGAIN')
    await chooseAs(ashley, code, 'NEXT')
    const moved = await chooseAs(damien, code, 'NEXT')
    expect(moved.body).toMatchObject({ phase: 'VOTING', round: 0, dealIndex: 1 })
  })

  it('keeps looking after a match once 80% pick it, and only next is allowed', async () => {
    const code = await liveRoom([await publishedDeal('Matched'), await publishedDeal('After')])
    await voteAs(host, code, 'YAY')
    await voteAs(ashley, code, 'YAY')
    expect((await chooseAs(host, code, 'AGAIN')).status).toBe(400)
    const one = await chooseAs(host, code, 'NEXT')
    expect(one.body).toMatchObject({ phase: 'MATCHED', tally: { next: 1 } })
    await chooseAs(ashley, code, 'NEXT')
    const moved = await chooseAs(damien, code, 'NEXT')
    expect(moved.body).toMatchObject({
      phase: 'VOTING',
      dealIndex: 1,
      round: 0,
      matchDealId: null,
      tally: { next: 0, yesPeople: 0 },
    })
  })

  it('lets the host remove someone mid-vote and close a matched room', async () => {
    const code = await liveRoom([await publishedDeal('Kick live')])
    const synced = await call(host, 'POST', room(code, '/sync'), { after: 0 })
    const damienId = synced.body.state.members.find(
      (member: { name: string }) => member.name === 'Damien',
    ).id
    const removed = await call(host, 'POST', room(code, `/members/${damienId}/remove`))
    expect(removed.status).toBe(200)
    expect(removed.body.tally.voters).toBe(2)
    expect((await voteAs(damien, code, 'YAY')).status).toBe(403)
    await voteAs(host, code, 'YAY')
    expect((await voteAs(ashley, code, 'YAY')).body.phase).toBe('MATCHED')
    expect((await call(host, 'POST', room(code, '/close'))).body).toMatchObject({
      status: 'CLOSED',
      closeReason: 'HOST_CLOSED',
    })
  })

  it('offers the top pick when every deal is voted down, then lets the host add more', async () => {
    const only = await publishedDeal('Only')
    const code = await liveRoom([only])
    await voteAs(host, code, 'YAY', 3)
    await voteAs(ashley, code, 'NAH')
    await voteAs(damien, code, 'NAH')
    for (const person of [host, ashley, damien]) await chooseAs(person, code, 'NEXT')
    const out = await call(host, 'POST', room(code, '/sync'), { after: 0 })
    expect(out.body.state).toMatchObject({ phase: 'OUT_OF_DEALS', topDealId: only })
    const extra = await publishedDeal('Extra')
    const added = await call(host, 'POST', room(code, '/deals'), { dealIds: [extra] })
    expect(added.body).toMatchObject({ phase: 'VOTING', dealIndex: 1 })
  })

  it('lets late joiners watch but not vote, and hands the host role on', async () => {
    const code = await liveRoom([await publishedDeal('Watch')])
    const watching = await join(late, code, 'Late')
    expect(watching.body.me.spectator).toBe(true)
    expect((await voteAs(late, code, 'YAY')).status).toBe(403)
    const left = await call(host, 'POST', room(code, '/leave'))
    expect(left.body.me.left).toBe(true)
    const synced = await call(ashley, 'POST', room(code, '/sync'), { after: 0 })
    expect(synced.body.state.me.isHost).toBe(true)
    expect(synced.body.events.map((event: { kind: string }) => event.kind)).toContain(
      'HOST_CHANGED',
    )
    const back = await join(host, code, 'Allison')
    expect(back.body.me).toMatchObject({ spectator: false, left: false })
  })

  it('stops waiting for someone who went quiet', async () => {
    const code = await liveRoom([await publishedDeal('Quiet')])
    await voteAs(host, code, 'NAH')
    await voteAs(ashley, code, 'NAH')
    const stuck = await call(host, 'POST', room(code, '/sync'), { after: 0 })
    expect(stuck.body.state.phase).toBe('VOTING')
    await db.squadMember.updateMany({
      where: { userId: damien.id },
      data: { lastSeenAt: new Date(Date.now() - 120_000) },
    })
    const moved = await call(host, 'POST', room(code, '/sync'), { after: 0 })
    expect(moved.body.state.phase).toBe('DECIDING')
    expect(
      moved.body.state.members.find((member: { name: string }) => member.name === 'Damien').away,
    ).toBe(true)
  })

  it('skips a deal that ended mid-vote', async () => {
    const first = await publishedDeal('Ending')
    const code = await liveRoom([first, await publishedDeal('After')])
    await db.deal.update({
      where: { id: first },
      data: { validUntil: new Date(Date.now() - 1000) },
    })
    const synced = await call(host, 'POST', room(code, '/sync'), { after: 0 })
    expect(synced.body.state).toMatchObject({ dealIndex: 1, phase: 'VOTING' })
    expect(synced.body.events.map((event: { kind: string }) => event.kind)).toContain('DEAL_ENDED')
  })
})

describe('live channel and load', () => {
  beforeAll(() => realtime.setSquadPublisher(fakePusher))
  afterAll(() => realtime.setSquadPublisher(null))
  const pushedKinds = (code: string) =>
    pushes
      .filter((push) => push.channel === `private-squad-${code}` && push.event === 'events')
      .flatMap((push) => push.data.events.map((event) => event.kind))

  it('pushes room changes in order, and for taps only the new ballot', async () => {
    const code = await liveRoom([await publishedDeal('Pushed')])
    expect(pushedKinds(code)).toEqual(['JOINED', 'JOINED', 'STARTED'])
    await voteAs(ashley, code, 'YAY', 2)
    await voteAs(ashley, code, 'YAY', 3)
    await voteAs(host, code, 'YAY')
    expect(pushedKinds(code).slice(3)).toEqual(['MATCH'])
    const ballots = pushes
      .filter((push) => push.channel === `private-squad-${code}` && push.data.ballot)
      .map((push) => push.data.ballot)
    expect(ballots).toEqual([
      expect.objectContaining({ stance: 'YAY', yays: 2 }),
      expect.objectContaining({ stance: 'YAY', yays: 5 }),
      expect.objectContaining({ stance: 'YAY', yays: 1 }),
    ])
    const { id: roomId } = await db.squadRoom.findFirstOrThrow({
      where: { code },
      orderBy: { createdAt: 'desc' },
    })
    expect(await db.squadEvent.count({ where: { roomId, kind: { in: ['YAY', 'NAH'] } } })).toBe(0)
  })

  it('signs room members into their channel and turns everyone else away', async () => {
    const code = await liveRoom([await publishedDeal('Channel')])
    const auth = (account: Account, channel: string) =>
      call(account, 'POST', '/squad/realtime/auth', { socketId: '123.456', channel })
    const member = await auth(ashley, `private-squad-${code}`)
    expect(member.status).toBe(200)
    expect(member.body.auth).toBe(`synthetic:123.456:private-squad-${code}`)
    expect((await auth(noah, `private-squad-${code}`)).status).toBe(403)
    expect((await auth(ashley, 'private-other-room')).status).toBe(400)
    expect((await call(null, 'POST', '/squad/realtime/auth', {})).status).toBe(401)
  })

  it('tells the browser whether a live channel is set up', async () => {
    const config = await call(null, 'GET', '/squad/realtime')
    expect(config).toMatchObject({ status: 200, body: { pusher: null } })
  })

  it('lands every vote while the whole room is syncing at the same time', async () => {
    const code = await liveRoom([await publishedDeal('Busy')])
    const syncs = [host, ashley, damien].flatMap((account) =>
      Array.from({ length: 4 }, () => call(account, 'POST', room(code, '/sync'), { after: 0 })),
    )
    const votes = [host, ashley].flatMap((account) =>
      Array.from({ length: 5 }, () => voteAs(account, code, 'NAH')),
    )
    const results = await Promise.all([...votes, ...syncs])
    expect(results.map((result) => result.status)).toEqual(results.map(() => 200))
    const ballots = await db.squadVote.findMany({ where: { nahs: { gt: 0 } } })
    const roomBallots = ballots.filter((ballot) =>
      results
        .slice(0, 10)
        .some((result) =>
          result.body.members?.some((member: { id: string }) => member.id === ballot.memberId),
        ),
    )
    expect(roomBallots.reduce((sum, ballot) => sum + ballot.nahs, 0)).toBe(10)
  })

  it('lands a spammer whose taps overlap, switching between yay and nah', async () => {
    const code = await liveRoom([await publishedDeal('Spam')])
    const stances = Array.from({ length: 30 }, (_, index) => (index % 3 === 2 ? 'YAY' : 'NAH'))
    const results = await Promise.all([
      ...stances.map((stance) => voteAs(host, code, stance as 'YAY' | 'NAH', 2)),
      ...stances.slice(0, 10).map(() => voteAs(ashley, code, 'NAH')),
      ...[host, ashley, damien].map((account) =>
        call(account, 'POST', room(code, '/sync'), { after: 0 }),
      ),
    ])
    expect(results.map((result) => result.status)).toEqual(results.map(() => 200))
    const host_ = await call(host, 'POST', room(code, '/sync'), { after: 0 })
    const me = host_.body.state.members.find(
      (member: { name: string }) => member.name === 'Allison',
    )
    const ballot = await db.squadVote.findFirstOrThrow({ where: { memberId: me.id } })
    expect(ballot.yays + ballot.nahs).toBe(60)
  })

  it('keeps the heartbeat read-only while a member was seen recently', async () => {
    const code = await liveRoom([await publishedDeal('Quiet heartbeat')])
    const recent = new Date(Date.now() - 2_000)
    await db.squadMember.updateMany({ where: { userId: ashley.id }, data: { lastSeenAt: recent } })
    expect((await call(ashley, 'POST', room(code, '/sync'), { after: 0 })).status).toBe(200)
    const seat = () =>
      db.squadMember.findFirstOrThrow({
        where: { userId: ashley.id },
        orderBy: { joinedAt: 'desc' },
      })
    expect((await seat()).lastSeenAt).toEqual(recent)
    const stale = new Date(Date.now() - 20_000)
    await db.squadMember.updateMany({ where: { userId: ashley.id }, data: { lastSeenAt: stale } })
    await call(ashley, 'POST', room(code, '/sync'), { after: 0 })
    expect((await seat()).lastSeenAt.getTime()).toBeGreaterThan(stale.getTime())
  })
})
