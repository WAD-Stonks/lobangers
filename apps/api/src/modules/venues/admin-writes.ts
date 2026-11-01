import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { geographySubjectHash, occupancySubjectHash } from '@api/modules/deals/outlet-eligibility'
import { DomainError } from '@api/modules/domain-error'
import { appendAdminAudit } from '@api/modules/platform-admin/audit'
import { legacyVersionWhere } from '@api/modules/platform-admin/operation-version'
import {
  accessTransaction,
  conflict,
  type Database,
  requireCurrentAdmin,
} from '@api/modules/platform-admin/transaction'
import {
  activeCatalogue,
  claimCatalogueParent,
  currentCatalogueVenue,
} from '@api/modules/venues/admin-data'
import { retainCurrentEvidence } from '@api/modules/venues/evidence'
import {
  catalogueMutationSchema,
  createCatalogueMerchantSchema,
  createCatalogueVenueSchema,
  patchCatalogueMerchantSchema,
  patchCatalogueVenueSchema,
} from '@broke-oclock/contracts/admin-catalogue'
import type { z } from 'zod'

export const createCatalogueMerchant = (
  db: Database,
  actor: AuthenticatedActor,
  raw: z.input<typeof createCatalogueMerchantSchema>,
) => {
  const input = createCatalogueMerchantSchema.parse(raw)
  return accessTransaction(db, async (tx) => {
    const admin = await requireCurrentAdmin(tx, actor)
    const row = await tx.merchant.create({ data: { name: input.name, catalogueVersion: 1 } })
    await appendAdminAudit(tx, admin, {
      action: 'MERCHANT_CREATED',
      subjectType: 'MERCHANT',
      subjectId: row.id,
      note: input.note,
      details: { catalogueVersionBefore: 0, catalogueVersionAfter: 1, changedFields: ['name'] },
    })
    return { id: row.id, version: 1 }
  })
}
export const patchCatalogueMerchant = (
  db: Database,
  actor: AuthenticatedActor,
  id: string,
  raw: z.input<typeof patchCatalogueMerchantSchema>,
) => {
  const input = patchCatalogueMerchantSchema.parse(raw)
  return accessTransaction(db, async (tx) => {
    const admin = await requireCurrentAdmin(tx, actor)
    const claim = await tx.merchant.updateMany({
      where: {
        id,
        AND: [activeCatalogue, legacyVersionWhere('catalogueVersion', input.expectedVersion)],
      },
      data: { name: input.name, catalogueVersion: input.expectedVersion + 1 },
    })
    if (claim.count !== 1) throw conflict()
    await appendAdminAudit(tx, admin, {
      action: 'MERCHANT_UPDATED',
      subjectType: 'MERCHANT',
      subjectId: id,
      note: input.note,
      details: {
        catalogueVersionBefore: input.expectedVersion,
        catalogueVersionAfter: input.expectedVersion + 1,
        changedFields: ['name'],
      },
    })
    return { id, version: input.expectedVersion + 1 }
  })
}
export const archiveCatalogueMerchant = (
  db: Database,
  actor: AuthenticatedActor,
  id: string,
  raw: z.input<typeof catalogueMutationSchema>,
) => {
  const input = catalogueMutationSchema.parse(raw)
  return accessTransaction(db, async (tx) => {
    const admin = await requireCurrentAdmin(tx, actor)
    const claim = await tx.merchant.updateMany({
      where: {
        id,
        AND: [activeCatalogue, legacyVersionWhere('catalogueVersion', input.expectedVersion)],
      },
      data: { deletedAt: new Date(), catalogueVersion: input.expectedVersion + 1 },
    })
    if (claim.count !== 1) throw conflict()
    await appendAdminAudit(tx, admin, {
      action: 'MERCHANT_ARCHIVED',
      subjectType: 'MERCHANT',
      subjectId: id,
      note: input.note,
      details: {
        catalogueVersionBefore: input.expectedVersion,
        catalogueVersionAfter: input.expectedVersion + 1,
        changedFields: ['deletedAt'],
      },
    })
    return { id, version: input.expectedVersion + 1 }
  })
}
export const createCatalogueVenue = (
  db: Database,
  actor: AuthenticatedActor,
  raw: z.input<typeof createCatalogueVenueSchema>,
) => {
  const input = createCatalogueVenueSchema.parse(raw)
  return accessTransaction(db, async (tx) => {
    const admin = await requireCurrentAdmin(tx, actor)
    await claimCatalogueParent(tx, input.merchantId, input.expectedMerchantVersion)
    const { note, confirmed: _confirmed, expectedMerchantVersion: _parent, ...fields } = input
    const row = await tx.venue.create({ data: { ...fields, catalogueVersion: 1 } })
    await appendAdminAudit(tx, admin, {
      action: 'VENUE_CREATED',
      subjectType: 'VENUE',
      subjectId: row.id,
      venueId: row.id,
      note,
      details: {
        catalogueVersionBefore: 0,
        catalogueVersionAfter: 1,
        changedFields: [
          'merchantId',
          'name',
          'address',
          'postalCode',
          'area',
          'latitude',
          'longitude',
          'geographyPrecision',
        ],
      },
    })
    return { id: row.id, version: 1 }
  })
}
export const patchCatalogueVenue = (
  db: Database,
  actor: AuthenticatedActor,
  id: string,
  raw: z.input<typeof patchCatalogueVenueSchema>,
) => {
  const input = patchCatalogueVenueSchema.parse(raw)
  return accessTransaction(db, async (tx) => {
    const admin = await requireCurrentAdmin(tx, actor)
    const before = await currentCatalogueVenue(tx, id, input.expectedVersion)
    await claimCatalogueParent(tx, before.merchantId)
    const { note, confirmed: _confirmed, expectedVersion, ...fields } = input
    const after = { ...before, ...fields }
    if (
      (after.latitude === 0 && after.longitude === 0) ||
      !after.address.trim() ||
      !/^\d{6}$/.test(after.postalCode ?? '') ||
      !after.area?.trim() ||
      !after.catalogueKey?.trim() ||
      !Number.isFinite(after.latitude) ||
      Math.abs(after.latitude) > 90 ||
      !Number.isFinite(after.longitude) ||
      Math.abs(after.longitude) > 180 ||
      !['PROPERTY', 'OUTLET'].includes(after.geographyPrecision ?? '')
    )
      throw new DomainError('BAD_REQUEST', 'A resolved non-placeholder outlet tuple is required')
    const invalidated =
      geographySubjectHash(before) !== geographySubjectHash(after) ||
      occupancySubjectHash(before) !== occupancySubjectHash(after)
    if (invalidated)
      await retainCurrentEvidence(
        tx,
        admin,
        before,
        'Tuple corrected; prior authority withdrawn without recertification',
      )
    const result = await tx.venue.updateMany({
      where: {
        id,
        AND: [activeCatalogue, legacyVersionWhere('catalogueVersion', expectedVersion)],
      },
      data: {
        ...fields,
        catalogueVersion: expectedVersion + 1,
        ...(invalidated
          ? { geographyEvidence: { unset: true }, occupancyEvidence: { unset: true } }
          : {}),
      },
    })
    if (result.count !== 1) throw conflict()
    // catalogueKey participates in subject hashes but is not an audit allowlist field.
    const changedFields = Object.keys(fields).filter(
      (key) => key !== 'catalogueKey',
    ) as NonNullable<
      import('@broke-oclock/contracts/admin-common').AdminAuditDetails['changedFields']
    >
    if (invalidated) changedFields.push('geographyEvidence', 'occupancyEvidence')
    await appendAdminAudit(tx, admin, {
      action: 'VENUE_UPDATED',
      subjectType: 'VENUE',
      subjectId: id,
      venueId: id,
      note,
      details: {
        catalogueVersionBefore: expectedVersion,
        catalogueVersionAfter: expectedVersion + 1,
        changedFields,
      },
    })
    return { id, version: expectedVersion + 1 }
  })
}
export const archiveCatalogueVenue = (
  db: Database,
  actor: AuthenticatedActor,
  id: string,
  raw: z.input<typeof catalogueMutationSchema>,
) => {
  const input = catalogueMutationSchema.parse(raw)
  return accessTransaction(db, async (tx) => {
    const admin = await requireCurrentAdmin(tx, actor)
    const row = await currentCatalogueVenue(tx, id, input.expectedVersion)
    await claimCatalogueParent(tx, row.merchantId)
    const result = await tx.venue.updateMany({
      where: {
        id,
        AND: [activeCatalogue, legacyVersionWhere('catalogueVersion', input.expectedVersion)],
      },
      data: { deletedAt: new Date(), catalogueVersion: input.expectedVersion + 1 },
    })
    if (result.count !== 1) throw conflict()
    await appendAdminAudit(tx, admin, {
      action: 'VENUE_ARCHIVED',
      subjectType: 'VENUE',
      subjectId: id,
      venueId: id,
      note: input.note,
      details: {
        catalogueVersionBefore: input.expectedVersion,
        catalogueVersionAfter: input.expectedVersion + 1,
        changedFields: ['deletedAt'],
      },
    })
    return { id, version: input.expectedVersion + 1 }
  })
}
