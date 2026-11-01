import { expect, type Page, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import * as fixtures from './community-fixtures'

// The live Makan Squad room: voting with effects, deciding, a match, watching after the start,
// minimising on a phone, locked pins, opening a deal and leaving. The API is mocked with an
// in-memory synthetic room; every person and deal is fake.
const { DEALS, HOME, mockPublicApi, mockSignedIn, VENUES } = fixtures
test.use({ geolocation: HOME, permissions: ['geolocation'] })

const CODE = 'KOPI'
const id = (n: number) => `c${n}`.repeat(12).slice(0, 24)
const ME = id(1)
const ASHLEY = id(2)
const DAMIEN = id(3)

type Stance = 'YAY' | 'NAH' | null
type Phase = 'VOTING' | 'DECIDING' | 'MATCHED' | 'OUT_OF_DEALS'

const squadDeal = (
  deal: (typeof DEALS)[number],
  venue: { id: string; name: string; lat: number; lng: number },
) => ({
  id: deal.id,
  title: deal.title,
  label: deal.label,
  category: deal.category,
  priceMinor: deal.priceMinor,
  imageUrl: null,
  venueId: venue.id,
  venueName: venue.name,
  lat: venue.lat,
  lng: venue.lng,
  ended: false,
})

const ROOM_DEALS = [squadDeal(DEALS[1], VENUES.chicken), squadDeal(DEALS[2], VENUES.boba)]

// A tiny stand-in for the server: three members, votes and choices, events for effects.
const mockRoom = async (page: Page, options: { spectator?: boolean } = {}) => {
  const room = {
    phase: 'VOTING' as Phase,
    dealIndex: 0,
    round: 0,
    left: false,
    stances: { [ME]: null, [ASHLEY]: null, [DAMIEN]: null } as Record<string, Stance>,
    choices: {} as Record<string, string>,
    yays: {} as Record<string, number>,
    events: [] as {
      seq: number
      kind: string
      memberId: string | null
      dealIndex: number | null
      at: string
    }[],
  }
  const push = (kind: string, memberId: string | null) =>
    room.events.push({
      seq: room.events.length + 1,
      kind,
      memberId,
      dealIndex: room.dealIndex,
      at: new Date().toISOString(),
    })
  const voters = () => [ME, ASHLEY, DAMIEN]
  const settle = () => {
    const yes = voters().filter((member) => room.stances[member] === 'YAY').length
    if (room.phase === 'VOTING' && yes * 2 > 3) room.phase = 'MATCHED'
    else if (room.phase === 'VOTING' && voters().every((member) => room.stances[member]))
      room.phase = 'DECIDING'
  }
  const member = (memberId: string, name: string, avatar: string, isHost: boolean) => ({
    id: memberId,
    name,
    avatar,
    isHost,
    spectator: memberId === ME && !!options.spectator,
    away: false,
    stance: room.phase === 'VOTING' ? room.stances[memberId] : room.stances[memberId],
    choice: (room.choices[memberId] as 'AGAIN' | 'NEXT' | undefined) ?? null,
    yays: room.yays[memberId] ?? 0,
  })
  const state = () => ({
    code: CODE,
    status: 'LIVE',
    phase: room.phase,
    closeReason: null,
    capacity: 4,
    dealIndex: room.dealIndex,
    round: room.round,
    deals: ROOM_DEALS,
    matchDealId: room.phase === 'MATCHED' ? ROOM_DEALS[room.dealIndex]?.id : null,
    topDealId: null,
    members: [
      member(ME, 'Allison', 'kopi', !options.spectator),
      member(ASHLEY, 'Ashley', 'bao', !!options.spectator),
      member(DAMIEN, 'Damien', 'kaya', false),
    ].filter((item) => !(item.id === ME && room.left)),
    me: {
      memberId: ME,
      isHost: !options.spectator && !room.left,
      spectator: !!options.spectator,
      left: room.left,
      kicked: false,
    },
    tally: {
      yesPeople: voters().filter((m) => room.stances[m] === 'YAY').length,
      voters: 3,
      voted: voters().filter((m) => room.stances[m]).length,
      again: Object.values(room.choices).filter((c) => c === 'AGAIN').length,
      next: Object.values(room.choices).filter((c) => c === 'NEXT').length,
    },
    createdAt: new Date().toISOString(),
    expiresAt: null,
    serverTime: new Date().toISOString(),
  })
  await page.route(`**/api/squad/rooms/${CODE}/**`, async (route) => {
    const action = new URL(route.request().url()).pathname.split('/').pop()
    const body = route.request().postDataJSON() ?? {}
    if (action === 'sync') {
      const after = Number(body.after ?? 0)
      return route.fulfill({
        json: {
          state: state(),
          events: room.events.filter((event) => event.seq > after),
          nextSeq: room.events.length,
        },
      })
    }
    if (action === 'votes') {
      room.stances[ME] = body.stance
      if (body.stance === 'YAY') room.yays[ME] = (room.yays[ME] ?? 0) + Number(body.taps ?? 1)
      push(body.stance, ME)
      settle()
    }
    if (action === 'choices') room.choices[ME] = body.choice
    if (action === 'leave') room.left = true
    if (action === 'join') room.left = false
    return route.fulfill({ json: state() })
  })
  return {
    // What the other two do, as the server would record it.
    others: (ashley: Stance, damien: Stance) => {
      room.stances[ASHLEY] = ashley
      room.stances[DAMIEN] = damien
      if (ashley) push(ashley, ASHLEY)
      if (damien) push(damien, DAMIEN)
      settle()
    },
  }
}

const openRoom = async (page: Page) => {
  await page.goto(`/squad/${CODE}`)
  await expect(page.getByTestId('splash-screen')).toBeHidden()
  await expect(page.getByTestId('squad-live')).toBeVisible()
}

test('every tap plays, others show up as effects, and more than half is a match', async ({
  page,
}) => {
  await mockPublicApi(page)
  await mockSignedIn(page)
  const room = await mockRoom(page)
  await openRoom(page)
  await expect(page.getByTestId('squad-deal')).toContainText(DEALS[1].title)
  for (const _ of [1, 2, 3]) await page.getByTestId('squad-yay').click()
  await expect(page.locator('.squad-fx__sticker')).toHaveCount(3)
  room.others('YAY', null)
  await expect(page.getByTestId('squad-match')).toBeVisible({ timeout: 5000 })
  await expect(page.getByTestId('squad-match')).toContainText("It's a match!")
})

test('a short vote asks everyone to vote again or move on', async ({ page }) => {
  await mockPublicApi(page)
  await mockSignedIn(page)
  const room = await mockRoom(page)
  await openRoom(page)
  await page.getByTestId('squad-nah').click()
  room.others('YAY', 'NAH')
  await expect(page.getByTestId('squad-again')).toBeVisible({ timeout: 5000 })
  await page.getByTestId('squad-next').click()
  await expect(page.getByTestId('squad-next')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.squad-fx__whoosh')).toBeVisible()
})

test('someone who joined late watches but cannot vote', async ({ page }) => {
  await mockPublicApi(page)
  await mockSignedIn(page)
  await mockRoom(page, { spectator: true })
  await openRoom(page)
  await expect(page.getByText("You're watching.")).toBeVisible()
  await expect(page.getByTestId('squad-yay')).toBeDisabled()
})

test('the deal opens its full details and comes back to the room', async ({ page }) => {
  await mockPublicApi(page)
  await mockSignedIn(page)
  await mockRoom(page)
  await openRoom(page)
  await page.getByTestId('squad-deal').click()
  await expect(page).toHaveURL(/from=squad/)
  await page.getByRole('link', { name: `Back to Room ${CODE}` }).click()
  await expect(page.getByTestId('squad-live')).toBeVisible()
})

test('a phone can tuck the room away, other deals stay locked, and the bar opens it again', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockPublicApi(page)
  await mockSignedIn(page)
  await mockRoom(page)
  await openRoom(page)
  await page.getByTestId('squad-minimise').click()
  await expect(page.getByTestId('squad-mini')).toBeVisible()
  // The camera follows the room's deal, so this pin may sit off screen; tap it directly.
  await page.locator('.deal-map-pin', { has: page.getByText('$1.20') }).dispatchEvent('click')
  await expect(
    page.getByText(`You're in Room ${CODE}. Leave the room to open other deals.`),
  ).toBeVisible()
  await page.getByTestId('squad-mini').click()
  await expect(page.getByTestId('squad-yay')).toBeVisible()
})

test('leaving asks first, and the room can be rejoined while open', async ({ page }) => {
  await mockPublicApi(page)
  await mockSignedIn(page)
  await mockRoom(page)
  await openRoom(page)
  await page.getByTestId('squad-leave').click()
  await expect(page.getByRole('dialog', { name: `Leave Room ${CODE}?` })).toBeVisible()
  await page.getByTestId('squad-leave-confirm').click()
  await expect(page.getByText(`You left Room ${CODE}`)).toBeVisible()
  await page.getByTestId('squad-rejoin').click()
  await expect(page.getByTestId('squad-yay')).toBeVisible()
})

test('live room screens for review', async ({ page }, info) => {
  test.setTimeout(120_000)
  for (const width of [390, 834, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    await page.unrouteAll()
    await mockPublicApi(page)
    await mockSignedIn(page)
    const room = await mockRoom(page)
    await openRoom(page)
    for (const _ of [1, 2]) await page.getByTestId('squad-yay').click()
    await page.waitForTimeout(700)
    await page.screenshot({ path: info.outputPath(`squad-voting-${width}.png`) })
    room.others('YAY', null)
    await expect(page.getByTestId('squad-match')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(600)
    await page.screenshot({ path: info.outputPath(`squad-match-${width}.png`) })
  }
})
