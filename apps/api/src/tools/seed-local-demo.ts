import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  geographySubjectHash,
  occupancySubjectHash,
  outletScopeHash,
} from '@api/modules/deals/outlet-eligibility'
import type { Database } from '@api/modules/platform-admin/transaction'

// Fills a database with fake stalls, deals and Flash Drops around Bedok, so the map, Makan
// Squad rooms and Flash Drop can be tried by hand. Every record is fake and says so ("Fake
// deal." starts each description, stall names start with "Fake", drops are marked demo). By
// default it only runs against a database on this machine; the shared team database needs the
// explicit --shared-db flag. Running it again replaces the previous fake records, nothing else.
//
//   pnpm run db:seed:demo -- --admin admin@example.test --merchant merchant@example.test
//
// --admin and --merchant (optional, repeatable) give accounts you already signed up with in the
// app those roles; use distinct accounts because each account has one role. A merchant also
// gets the fake chicken rice stall and owns the fake drops.
// On a shared database, drops are only created when --merchant names the owner.

const DEMO_TAG = 'DEMO-LOCAL'
const RECEIPT = 'FAKE: local demo data, not evidence for a real outlet'
const FAKE_URL = 'https://example.test/local-demo'

type Stall = { name: string; area: string; lat: number; lng: number }
type DemoDeal = {
  stall: number
  title: string
  category: string
  offerType: 'FIXED_PRICE' | 'BUY_ONE_GET_ONE' | 'PERCENT_OFF' | 'OTHER'
  priceMinor: number | null
  discountPercent?: number
}

const STALLS: Stall[] = [
  { name: 'Fake Ah Seng Chicken Rice (Bedok)', area: 'Bedok', lat: 1.3229, lng: 103.9262 },
  { name: 'Fake Kopi Corner', area: 'Bedok', lat: 1.3241, lng: 103.9281 },
  { name: 'Fake Boba Lab', area: 'Bedok', lat: 1.3248, lng: 103.9256 },
  { name: 'Fake Prata House', area: 'Bedok', lat: 1.3222, lng: 103.9289 },
  { name: 'Fake Laksa Stall', area: 'Tanah Merah', lat: 1.3266, lng: 103.9433 },
  { name: 'Fake Kaya Toast Bakery', area: 'Simei', lat: 1.3432, lng: 103.953 },
]

const DEALS: DemoDeal[] = [
  {
    stall: 0,
    title: 'Chicken rice set',
    category: 'FOOD',
    offerType: 'FIXED_PRICE',
    priceMinor: 350,
  },
  {
    stall: 0,
    title: 'Roast chicken rice 1-for-1',
    category: 'FOOD',
    offerType: 'BUY_ONE_GET_ONE',
    priceMinor: 450,
  },
  {
    stall: 1,
    title: 'Kopi O',
    category: 'DRINKS',
    offerType: 'PERCENT_OFF',
    priceMinor: 120,
    discountPercent: 40,
  },
  {
    stall: 2,
    title: 'Brown sugar boba 1-for-1',
    category: 'DRINKS',
    offerType: 'BUY_ONE_GET_ONE',
    priceMinor: 340,
  },
  {
    stall: 3,
    title: 'Plain prata, 2 for $1',
    category: 'FOOD',
    offerType: 'OTHER',
    priceMinor: null,
  },
  {
    stall: 3,
    title: 'Prata kosong set',
    category: 'FOOD',
    offerType: 'FIXED_PRICE',
    priceMinor: 210,
  },
  { stall: 4, title: 'Laksa', category: 'FOOD', offerType: 'FIXED_PRICE', priceMinor: 400 },
  {
    stall: 5,
    title: 'Kaya toast set',
    category: 'BAKERY',
    offerType: 'FIXED_PRICE',
    priceMinor: 280,
  },
]

// AI-generated food photos, served from apps/web/public/demo-food, in DEALS order.
const DEAL_IMAGES = [
  'chicken-rice-set',
  'roast-chicken-rice',
  'kopi-o',
  'brown-sugar-boba',
  'plain-prata',
  'prata-kosong-set',
  'laksa',
  'kaya-toast-set',
] as const

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

export const isLocalDatabase = (databaseUrl: string) => {
  const url = new URL(databaseUrl)
  return url.protocol === 'mongodb:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
}

// A database on this machine, or the shared one only when asked for by name.
export const assertSeedTarget = (databaseUrl: string | undefined, sharedAllowed: boolean) => {
  if (!databaseUrl) throw new Error('Set DATABASE_URL first.')
  if (!isLocalDatabase(databaseUrl) && !sharedAllowed)
    throw new Error(
      'Refusing to seed a database that is not on this machine. Add --shared-db to seed the shared team database on purpose.',
    )
}

const argValues = (flag: string) =>
  process.argv.flatMap((arg, index) => (arg === flag ? [process.argv[index + 1] ?? ''] : []))

export const assertDistinctDemoRoles = (
  admins: readonly string[],
  merchants: readonly string[],
) => {
  const adminEmails = new Set(admins.map((email) => email.trim().toLowerCase()))
  if (merchants.some((email) => adminEmails.has(email.trim().toLowerCase())))
    throw new Error('Use distinct accounts for --admin and --merchant; each account has one role.')
}

const clearPreviousDemo = async (db: Database) => {
  const merchants = await db.merchant.findMany({
    where: { name: { startsWith: `${DEMO_TAG} ` } },
    select: { id: true },
  })
  const merchantIds = merchants.map((merchant) => merchant.id)
  const deals = await db.deal.findMany({
    where: { merchantId: { in: merchantIds } },
    select: { id: true },
  })
  const dealIds = deals.map((deal) => deal.id)
  const drops = await db.flashDrop.findMany({
    where: { dealId: { in: dealIds } },
    select: { id: true },
  })
  await db.flashDropClaim.deleteMany({ where: { dropId: { in: drops.map((drop) => drop.id) } } })
  await db.flashDrop.deleteMany({ where: { dealId: { in: dealIds } } })
  await db.dealVenue.deleteMany({ where: { dealId: { in: dealIds } } })
  await db.uploadedFile.deleteMany({ where: { dealId: { in: dealIds } } })
  await db.deal.deleteMany({ where: { id: { in: dealIds } } })
  const venues = await db.venue.findMany({
    where: { merchantId: { in: merchantIds } },
    select: { id: true },
  })
  await db.stallGrant.deleteMany({ where: { venueId: { in: venues.map((venue) => venue.id) } } })
  await db.venue.deleteMany({ where: { merchantId: { in: merchantIds } } })
  await db.merchant.deleteMany({ where: { id: { in: merchantIds } } })
}

// A stall whose location and occupancy carry fake "verified" receipts, so its deals can show.
const createStall = async (db: Database, stall: Stall, now: Date) => {
  const merchant = await db.merchant.create({ data: { name: `${DEMO_TAG} ${stall.name}` } })
  const created = await db.venue.create({
    data: {
      merchantId: merchant.id,
      name: stall.name,
      address: `1 Fake Street, ${stall.area}`,
      area: stall.area,
      latitude: stall.lat,
      longitude: stall.lng,
    },
  })
  const keyed = await db.venue.update({
    where: { id: created.id },
    data: { catalogueKey: `${DEMO_TAG}:${created.id}`, geographyPrecision: 'OUTLET' },
  })
  const proof = (subjectHash: string) => ({
    state: 'VERIFIED' as const,
    provider: 'OFFICIAL_MERCHANT' as const,
    reference: RECEIPT,
    sourceUrl: FAKE_URL,
    verifiedAt: now,
    subjectHash,
  })
  const venue = await db.venue.update({
    where: { id: keyed.id },
    data: {
      occupancyEvidence: proof(occupancySubjectHash(keyed)),
      geographyEvidence: proof(geographySubjectHash(keyed)),
    },
  })
  return { merchantId: merchant.id, venueId: venue.id }
}

const createDeal = async (
  db: Database,
  deal: DemoDeal,
  place: { merchantId: string; venueId: string },
  now: Date,
) => {
  const created = await db.deal.create({
    data: {
      title: deal.title,
      description: `Fake deal. Local demo data for trying LoBangers: ${deal.title.toLowerCase()}.`,
      category: deal.category,
      offerType: deal.offerType,
      priceMinor: deal.priceMinor,
      discountPercent: deal.discountPercent ?? null,
      terms: 'Fake deal for local testing. Not a real offer.',
      validFrom: new Date(now.getTime() - DAY_MS),
      validUntil: new Date(now.getTime() + 14 * DAY_MS),
      applicability: 'SELECTED_OUTLETS',
      reviewStatus: 'APPROVED',
      reviewedVersion: 1,
      reviewedAt: now,
      publishedAt: now,
      merchantId: place.merchantId,
      venues: { create: [{ venueId: place.venueId }] },
    },
  })
  await db.deal.update({
    where: { id: created.id },
    data: {
      scopeConfirmation: {
        basis: 'SOURCE_SELECTED',
        contentVersion: created.contentVersion,
        scopeHash: outletScopeHash({
          id: created.id,
          merchantId: place.merchantId,
          applicability: 'SELECTED_OUTLETS',
          contentVersion: created.contentVersion,
          selectedVenueIds: [place.venueId],
        }),
        evidenceRef: RECEIPT,
        sourceUrl: FAKE_URL,
        confirmedAt: now,
        retainedVenueIds: [],
      },
    },
  })
  return created.id
}

export const seedLocalDemo = async (
  db: Database,
  options: { admins: string[]; merchants: string[]; shared: boolean },
) => {
  assertDistinctDemoRoles(options.admins, options.merchants)
  const now = new Date()
  await clearPreviousDemo(db)
  const places = []
  for (const stall of STALLS) places.push(await createStall(db, stall, now))
  const dealIds = []
  for (const deal of DEALS) {
    const place = places[deal.stall]
    if (place) dealIds.push(await createDeal(db, deal, place, now))
  }

  const owner =
    options.merchants.length > 0
      ? await db.user.findFirst({ where: { email: options.merchants[0] }, select: { id: true } })
      : null
  // Locally any account will do; on a shared database only the named merchant owns drops.
  const merchantUserId =
    owner?.id ??
    (options.shared ? undefined : (await db.user.findFirst({ select: { id: true } }))?.id)
  if (merchantUserId) {
    const webOrigin = (process.env.WEB_ORIGIN?.trim() || 'http://localhost:5173').replace(/\/$/, '')
    for (const [index, dealId] of dealIds.entries()) {
      const image = DEAL_IMAGES[index]
      if (!image) continue
      await db.uploadedFile.create({
        data: {
          key: `${DEMO_TAG}:${dealId}`,
          url: `${webOrigin}/demo-food/${image}.jpg`,
          mimeType: 'image/jpeg',
          sizeBytes: 200_000,
          uploaderId: merchantUserId,
          dealId,
        },
      })
    }
  } else {
    console.info('No account to own the demo photos: pass --merchant with your account email.')
  }
  const [chicken, , kopi, , prata] = dealIds
  const [chickenStall, kopiStall, , prataStall] = places
  if (merchantUserId && chicken && kopi && prata && chickenStall && kopiStall && prataStall) {
    // One flash deal live right now, one draft waiting for the merchant to press Go live, both
    // clearly fake.
    await db.flashDrop.create({
      data: {
        dealId: kopi,
        venueId: kopiStall.venueId,
        merchantUserId,
        flashPriceMinor: 50,
        startsAt: new Date(now.getTime() - MINUTE_MS),
        endsAt: new Date(now.getTime() + 60 * MINUTE_MS),
        radiusMetres: 500,
        codeLimit: 40,
        status: 'APPROVED',
        reviewNote: 'Fake deal for local testing.',
        demo: true,
      },
    })
    await db.flashDrop.create({
      data: {
        dealId: prata,
        venueId: prataStall.venueId,
        merchantUserId,
        flashPriceMinor: 100,
        startsAt: new Date(now.getTime() + 30 * MINUTE_MS),
        endsAt: new Date(now.getTime() + 90 * MINUTE_MS),
        radiusMetres: 1000,
        codeLimit: 100,
        status: 'DRAFT',
        demo: true,
      },
    })
  } else {
    console.info(
      'No owner for the Flash Drops: pass --merchant with your account email to add them.',
    )
  }

  for (const email of options.admins) {
    const user = await db.user.updateMany({ where: { email }, data: { role: 'ADMIN' } })
    console.info(
      user.count ? `${email} is now an admin.` : `No account for ${email}; sign up first.`,
    )
  }
  for (const email of options.merchants) {
    const user = await db.user.findFirst({ where: { email }, select: { id: true } })
    if (!user || !chickenStall) {
      console.info(`No account for ${email}; sign up first.`)
      continue
    }
    await db.user.update({ where: { id: user.id }, data: { role: 'MERCHANT' } })
    await db.stallGrant.upsert({
      where: { userId_venueId: { userId: user.id, venueId: chickenStall.venueId } },
      create: { userId: user.id, venueId: chickenStall.venueId },
      update: { revokedAt: null },
    })
    console.info(`${email} is now a merchant for ${STALLS[0]?.name}.`)
  }
  console.info(`Seeded ${STALLS.length} fake stalls and ${dealIds.length} fake deals around Bedok.`)
}

// Importing the seeder never connects or runs it; only the CLI does.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const shared = process.argv.includes('--shared-db')
    assertSeedTarget(process.env.DATABASE_URL, shared)
    const admins = argValues('--admin')
    const merchants = argValues('--merchant')
    assertDistinctDemoRoles(admins, merchants)
    const { db } = await import('@broke-oclock/db')
    try {
      await seedLocalDemo(db, {
        admins,
        merchants,
        shared: shared && !isLocalDatabase(process.env.DATABASE_URL ?? ''),
      })
    } finally {
      await db.$disconnect()
    }
  } catch (error) {
    console.error('Seeding failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
