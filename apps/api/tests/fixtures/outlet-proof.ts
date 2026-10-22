import {
  geographySubjectHash,
  occupancySubjectHash,
  outletScopeHash,
} from '@api/modules/deals/outlet-eligibility'
import type { OutletScopeBasis, PrismaClient } from '@broke-oclock/db/client'

// SYNTHETIC unconditional official receipts for explicit positive test controls ONLY.
// No source is fetched and these receipts are not evidence for real-world outlets.
const receipt = 'SYNTHETIC: https://official.example.test/unconditional-outlet-proof'
const sourceUrl = 'https://official.example.test/unconditional-outlet-proof'
const verifiedAt = new Date('2026-10-01T00:00:00.000Z')

const disposableClients = new WeakSet<PrismaClient>()

export const registerSyntheticOutletFixtureDatabase = (db: PrismaClient, databaseUrl: string) => {
  const url = new URL(databaseUrl)
  if (
    process.env.NODE_ENV !== 'test' ||
    url.protocol !== 'mongodb:' ||
    url.hostname !== '127.0.0.1' ||
    !url.pathname.match(
      /^\/(deals_|venues_|integration_|public_media_|ingestion_|platform_admin_|lane_e_handoff_)[a-f0-9]+$/,
    )
  )
    throw new Error('Synthetic outlet receipts require an owned loopback test database')
  disposableClients.add(db)
}

const requireDisposableDatabase = (db: PrismaClient) => {
  // Vitest resets process.env between tests; bind the owned client once in beforeAll.
  if (!disposableClients.has(db)) throw new Error('Unregistered synthetic outlet fixture client')
}

export const seedSyntheticOccupancy = async (db: PrismaClient, venueId: string) => {
  requireDisposableDatabase(db)
  // Hash the final tuple, including newly assigned metadata; never updatedAt/proof fields.
  const venue = await db.venue.update({
    where: { id: venueId },
    data: { catalogueKey: `SYNTHETIC:${venueId}`, geographyPrecision: 'OUTLET' },
  })
  return db.venue.update({
    where: { id: venue.id },
    data: {
      occupancyEvidence: {
        state: 'VERIFIED',
        provider: 'OFFICIAL_MERCHANT',
        reference: receipt,
        sourceUrl,
        verifiedAt,
        subjectHash: occupancySubjectHash(venue),
      },
    },
  })
}

export const seedSyntheticOutletProof = async (db: PrismaClient, venueId: string) => {
  const venue = await seedSyntheticOccupancy(db, venueId)
  return db.venue.update({
    where: { id: venue.id },
    data: {
      geographyEvidence: {
        state: 'VERIFIED',
        provider: 'OFFICIAL_MERCHANT',
        reference: receipt,
        sourceUrl,
        verifiedAt,
        subjectHash: geographySubjectHash(venue),
      },
    },
  })
}

export const seedSyntheticScope = async (
  db: PrismaClient,
  dealId: string,
  basis: Exclude<OutletScopeBasis, 'UNCONFIRMED' | 'LEGACY_RETAINED'>,
  pinnedSyntheticSource?: { sourceUrl: string; sourceContentHash: string },
) => {
  requireDisposableDatabase(db)
  // Read every final edge, including ineligible edges. Never refresh approval/version fields.
  const deal = await db.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: { venues: true },
  })
  return db.deal.update({
    where: { id: deal.id },
    data: {
      scopeConfirmation: {
        basis,
        contentVersion: deal.contentVersion,
        scopeHash: outletScopeHash({
          ...deal,
          selectedVenueIds: deal.venues.map((edge) => edge.venueId),
        }),
        evidenceRef: receipt,
        sourceUrl: pinnedSyntheticSource?.sourceUrl ?? sourceUrl,
        ...(pinnedSyntheticSource
          ? { sourceContentHash: pinnedSyntheticSource.sourceContentHash }
          : {}),
        confirmedAt: verifiedAt,
        retainedVenueIds: [],
      },
    },
  })
}
