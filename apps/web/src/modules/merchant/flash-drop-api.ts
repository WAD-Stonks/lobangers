import type { MerchantFlashDrop, MerchantFlashDropBody } from '@broke-oclock/contracts/flash-drops'
import { ApiClientError, api } from '@web/lib/api-client'
import { getDeals, getOutlets, USE_SAMPLE_DATA } from '@web/modules/merchant/merchant-api'

export type { MerchantFlashDrop, MerchantFlashDropBody }
// Requests for the merchant's flash drops. This follows the same SAMPLE DATA SWITCH as
// merchant-api.ts: while USE_SAMPLE_DATA is true, nothing is sent to the server and the fake
// drops further down are used instead. They are kept in the browser and reset on refresh.
export { USE_SAMPLE_DATA }

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

// ---------------------------------------------------------------------------------------------
// Requests to the server, through the project's typed client (api.flashDrops.merchant).
// ---------------------------------------------------------------------------------------------

export const getFlashDrops = async (): Promise<MerchantFlashDrop[]> => {
  if (USE_SAMPLE_DATA) return sampleDrops
  const response = await api.flashDrops.merchant.list()
  return response.items
}

export const createFlashDrop = async (body: MerchantFlashDropBody): Promise<MerchantFlashDrop> => {
  if (USE_SAMPLE_DATA) {
    const drop = await sampleDropFrom(`sample-drop-${Date.now()}`, body, 1)
    sampleDrops = [drop, ...sampleDrops] // newest first
    return drop
  }
  return api.flashDrops.merchant.create(body)
}

// Sends a drop that LoBangers sent back again, after the merchant fixed it.
export const resendFlashDrop = async (
  drop: MerchantFlashDrop,
  body: MerchantFlashDropBody,
): Promise<MerchantFlashDrop> => {
  if (USE_SAMPLE_DATA) {
    const resent = await sampleDropFrom(drop.id, body, drop.version + 1)
    return replaceSample(resent)
  }
  return api.flashDrops.merchant.resubmit(drop.id, { ...body, version: drop.version })
}

// Withdraws a drop that is still in review, or ends a scheduled or live drop early.
export const endFlashDrop = async (drop: MerchantFlashDrop): Promise<MerchantFlashDrop> => {
  if (USE_SAMPLE_DATA) {
    const now = new Date().toISOString()
    // A drop that never started ends before it begins, so the dates stay in order.
    const startsAt = drop.startsAt < now ? drop.startsAt : now
    return replaceSample({
      ...drop,
      startsAt,
      endsAt: now,
      status: 'ENDED',
      version: drop.version + 1,
    })
  }
  return api.flashDrops.merchant.end(drop.id, drop.version)
}

// Turns a failed request into a sentence the merchant can understand.
export const flashDropErrorMessage = (error: unknown, fallback: string): string => {
  if (!(error instanceof ApiClientError)) return fallback
  if (error.status === 401) return 'Your session has ended. Please log in again.'
  if (error.status === 403) return 'You do not have access to this outlet any more.'
  // For these the server explains what is wrong, e.g. "The flash price has to be lower than
  // the usual price". Its generic one-word messages are less helpful than our own fallback.
  const generic = ['Invalid request', 'Not found', 'Not Found', 'Conflict']
  if ([400, 404, 409, 412].includes(error.status) && !generic.includes(error.message)) {
    return error.message
  }
  if (error.status === 409) return 'Someone changed this drop just now. Refresh and try again.'
  return fallback
}

// ---------------------------------------------------------------------------------------------
// Demo-only actions (sample data only). They stand in for the LoBangers admin and for people
// claiming codes on the map, so the whole flow can be clicked through. The page never shows the
// buttons for these while USE_SAMPLE_DATA is false.
// ---------------------------------------------------------------------------------------------

const requireSampleMode = () => {
  if (!USE_SAMPLE_DATA) throw new Error('Demo actions only work with sample data')
}

// Pretend LoBangers approved it: scheduled if it starts later, live if its start has passed.
export const simulateApproval = (drop: MerchantFlashDrop): MerchantFlashDrop => {
  requireSampleMode()
  const started = Date.parse(drop.startsAt) <= Date.now()
  return replaceSample({
    ...drop,
    status: started ? 'LIVE' : 'SCHEDULED',
    version: drop.version + 1,
  })
}

// Pretend the start time arrived: a scheduled drop goes live now, keeping its length.
export const simulateStart = (drop: MerchantFlashDrop): MerchantFlashDrop => {
  requireSampleMode()
  const length = Date.parse(drop.endsAt) - Date.parse(drop.startsAt)
  const now = Date.now()
  return replaceSample({
    ...drop,
    startsAt: new Date(now).toISOString(),
    endsAt: new Date(now + length).toISOString(),
    status: 'LIVE',
    version: drop.version + 1,
  })
}

// Pretend one more person claimed a code. The drop ends once every code is claimed or its time
// is up.
export const simulateClaim = (drop: MerchantFlashDrop): MerchantFlashDrop => {
  requireSampleMode()
  const claimedCount = Math.min(drop.codeLimit, drop.claimedCount + 1)
  const timeUp = Date.parse(drop.endsAt) <= Date.now()
  const status = claimedCount >= drop.codeLimit || timeUp ? 'ENDED' : drop.status
  return replaceSample({ ...drop, claimedCount, status })
}

// ---------------------------------------------------------------------------------------------
// Sample data (only used while USE_SAMPLE_DATA is true). Every drop is made up and has
// demo: true, which the page shows as a "Fake deal" label. Times are worked out from the moment
// the page loads, so the drops always make sense.
// ---------------------------------------------------------------------------------------------

const replaceSample = (updated: MerchantFlashDrop) => {
  sampleDrops = sampleDrops.map((drop) => (drop.id === updated.id ? updated : drop))
  return updated
}

// Builds a sample drop from what the form sent, looking up names in the sample deals.
const sampleDropFrom = async (
  id: string,
  body: MerchantFlashDropBody,
  version: number,
): Promise<MerchantFlashDrop> => {
  const deals = await getDeals()
  const outlets = await getOutlets()
  const deal = deals.find((item) => item.id === body.dealId)
  const outlet = outlets.find((item) => item.id === body.outletId)
  // Like the server: "start now" begins at the moment it is sent, never in the past.
  const startMs = Math.max(Date.parse(body.startsAt), Date.now())
  return {
    id,
    dealId: body.dealId,
    dealTitle: deal?.title ?? 'Sample deal',
    outletId: body.outletId,
    outletName: outlet?.name ?? 'Sample outlet',
    flashPriceCents: body.flashPriceCents,
    usualPriceCents: deal?.priceCents ?? null,
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(startMs + body.durationMinutes * MINUTE_MS).toISOString(),
    radiusMetres: body.radiusMetres,
    codeLimit: body.codeLimit,
    claimedCount: 0,
    status: 'IN_REVIEW',
    reviewNote: null,
    version,
    demo: true,
  }
}

// A time a whole number of hours from now, on the hour, so the sample times read nicely.
const hoursFromNow = (hours: number) => {
  const date = new Date(Date.now() + hours * HOUR_MS)
  date.setMinutes(0, 0, 0)
  return date
}
const plusMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * MINUTE_MS).toISOString()

const endedStart = hoursFromNow(-26)
const reviewStart = hoursFromNow(3)
const sentBackStart = hoursFromNow(27)

let sampleDrops: MerchantFlashDrop[] = [
  {
    id: 'sample-drop-1',
    dealId: 'sample-4',
    dealTitle: 'Steamed chicken rice set',
    outletId: 'outlet-2',
    outletName: 'Ah Seng Chicken Rice (Tiong Bahru)',
    flashPriceCents: 250,
    usualPriceCents: 350,
    startsAt: reviewStart.toISOString(),
    endsAt: plusMinutes(reviewStart, 30),
    radiusMetres: 300,
    codeLimit: 30,
    claimedCount: 0,
    status: 'IN_REVIEW',
    reviewNote: null,
    version: 1,
    demo: true,
  },
  {
    id: 'sample-drop-2',
    dealId: 'sample-1',
    dealTitle: '1-for-1 Roast Chicken Rice',
    outletId: 'outlet-1',
    outletName: 'Ah Seng Chicken Rice (Maxwell)',
    flashPriceCents: 300,
    usualPriceCents: null,
    startsAt: sentBackStart.toISOString(),
    endsAt: plusMinutes(sentBackStart, 60),
    radiusMetres: 1000,
    codeLimit: 100,
    claimedCount: 0,
    status: 'SENT_BACK',
    reviewNote:
      'A 1 km circle reaches two other chicken rice drops at that time. Please use 500 m.',
    version: 2,
    demo: true,
  },
  {
    id: 'sample-drop-3',
    dealId: 'sample-4',
    dealTitle: 'Steamed chicken rice set',
    outletId: 'outlet-1',
    outletName: 'Ah Seng Chicken Rice (Maxwell)',
    flashPriceCents: 150,
    usualPriceCents: 350,
    startsAt: endedStart.toISOString(),
    endsAt: plusMinutes(endedStart, 30),
    radiusMetres: 500,
    codeLimit: 40,
    claimedCount: 40,
    status: 'ENDED',
    reviewNote: null,
    version: 2,
    demo: true,
  },
]
