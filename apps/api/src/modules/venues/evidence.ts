import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { geographySubjectHash, occupancySubjectHash } from '@api/modules/deals/outlet-eligibility'
import { appendAdminAudit } from '@api/modules/platform-admin/audit'
import { legacyVersionWhere, normalizeVersion } from '@api/modules/platform-admin/operation-version'
import {
  type AccessTransaction,
  accessTransaction,
  conflict,
  type Database,
  requireCurrentAdmin,
} from '@api/modules/platform-admin/transaction'
import {
  recordCatalogueEvidenceSchema,
  withdrawCatalogueEvidenceSchema,
} from '@broke-oclock/contracts/admin-catalogue'

type Venue = Awaited<ReturnType<Database['venue']['findUniqueOrThrow']>>

import {
  activeCatalogue,
  claimCatalogueParent,
  currentCatalogueVenue,
} from '@api/modules/venues/admin-data'
import type { z } from 'zod'

// Snapshot the exact stored receipt, including its original hash and verification
// timestamp. Never recompute an old receipt against a corrected tuple.
export const retainCurrentEvidence = async (
  tx: AccessTransaction,
  admin: { id: string; name: string },
  venue: Venue,
  why: string,
  only?: 'GEOGRAPHY' | 'OCCUPANCY',
) => {
  for (const kind of ['GEOGRAPHY', 'OCCUPANCY'] as const) {
    if (only && only !== kind) continue
    const proof = kind === 'GEOGRAPHY' ? venue.geographyEvidence : venue.occupancyEvidence
    if (!proof) continue
    await tx.adminEvidence.create({
      data: {
        actorId: admin.id,
        actorName: admin.name,
        subjectType: 'VENUE',
        subjectId: venue.id,
        kind,
        catalogueVersion: normalizeVersion(venue.catalogueVersion),
        subjectHash: proof.subjectHash,
        provider: proof.provider,
        reference: proof.reference,
        sourceUrl: proof.sourceUrl,
        sourceContentHash: proof.sourceContentHash,
        observedAt: proof.observedAt,
        statement: JSON.stringify({ event: why, receipt: proof }),
      },
    })
  }
}
export const recordCatalogueEvidence = (
  db: Database,
  actor: AuthenticatedActor,
  id: string,
  raw: z.input<typeof recordCatalogueEvidenceSchema>,
) => {
  const input = recordCatalogueEvidenceSchema.parse(raw)
  return accessTransaction(db, async (tx) => {
    const admin = await requireCurrentAdmin(tx, actor)
    const row = await currentCatalogueVenue(tx, id, input.expectedVersion)
    await claimCatalogueParent(tx, row.merchantId)
    // A legacy unresolved tuple cannot acquire positive authority through an attestation.
    if (
      !row.address.trim() ||
      !/^\d{6}$/.test(row.postalCode ?? '') ||
      !row.area?.trim() ||
      !row.catalogueKey?.trim() ||
      !['PROPERTY', 'OUTLET'].includes(row.geographyPrecision ?? '') ||
      !Number.isFinite(row.latitude) ||
      Math.abs(row.latitude) > 90 ||
      !Number.isFinite(row.longitude) ||
      Math.abs(row.longitude) > 180 ||
      (row.latitude === 0 && row.longitude === 0)
    )
      throw conflict()
    const subjectHash =
      input.kind === 'GEOGRAPHY' ? geographySubjectHash(row) : occupancySubjectHash(row)
    const now = new Date()
    if (input.observedAt && new Date(input.observedAt) > now) throw conflict()
    await retainCurrentEvidence(
      tx,
      admin,
      row,
      'Superseded by a newly reviewed manual source',
      input.kind,
    )
    const receipt = await tx.adminEvidence.create({
      data: {
        actorId: admin.id,
        actorName: admin.name,
        subjectType: 'VENUE',
        subjectId: id,
        kind: input.kind,
        catalogueVersion: input.expectedVersion + 1,
        subjectHash,
        provider: 'ADMIN',
        reference: input.reference,
        sourceUrl: input.sourceUrl ?? null,
        observedAt: input.observedAt ? new Date(input.observedAt) : null,
        statement: `Manual verification (${input.sourceType}): ${input.statement}`,
      },
    })
    const proof = {
      state: 'VERIFIED' as const,
      provider: 'ADMIN' as const,
      reference: input.reference,
      subjectHash,
      sourceUrl: input.sourceUrl ?? null,
      sourceContentHash: null,
      observedAt: input.observedAt ? new Date(input.observedAt) : null,
      verifiedAt: now,
    }
    const claim = await tx.venue.updateMany({
      where: {
        id,
        AND: [activeCatalogue, legacyVersionWhere('catalogueVersion', input.expectedVersion)],
      },
      data: {
        catalogueVersion: input.expectedVersion + 1,
        ...(input.kind === 'GEOGRAPHY'
          ? { geographyEvidence: { set: proof } }
          : { occupancyEvidence: { set: proof } }),
      },
    })
    if (claim.count !== 1) throw conflict()
    await appendAdminAudit(tx, admin, {
      action: 'EVIDENCE_RECORDED',
      subjectType: 'VENUE',
      subjectId: id,
      venueId: id,
      note: input.note,
      details: {
        catalogueVersionBefore: input.expectedVersion,
        catalogueVersionAfter: input.expectedVersion + 1,
        evidenceIds: [receipt.id],
        changedFields: [input.kind === 'GEOGRAPHY' ? 'geographyEvidence' : 'occupancyEvidence'],
      },
    })
    return { id, version: input.expectedVersion + 1 }
  })
}
export const withdrawCatalogueEvidence = (
  db: Database,
  actor: AuthenticatedActor,
  id: string,
  raw: z.input<typeof withdrawCatalogueEvidenceSchema>,
) => {
  const input = withdrawCatalogueEvidenceSchema.parse(raw)
  return accessTransaction(db, async (tx) => {
    const admin = await requireCurrentAdmin(tx, actor)
    const row = await currentCatalogueVenue(tx, id, input.expectedVersion)
    await claimCatalogueParent(tx, row.merchantId)
    await retainCurrentEvidence(
      tx,
      admin,
      row,
      'Manual verification explicitly withdrawn',
      input.kind,
    )
    const result = await tx.venue.updateMany({
      where: {
        id,
        AND: [activeCatalogue, legacyVersionWhere('catalogueVersion', input.expectedVersion)],
      },
      data: {
        catalogueVersion: input.expectedVersion + 1,
        ...(input.kind === 'GEOGRAPHY'
          ? { geographyEvidence: { unset: true } }
          : { occupancyEvidence: { unset: true } }),
      },
    })
    if (result.count !== 1) throw conflict()
    await appendAdminAudit(tx, admin, {
      action: 'VENUE_UPDATED',
      subjectType: 'VENUE',
      subjectId: id,
      venueId: id,
      note: input.note,
      details: {
        catalogueVersionBefore: input.expectedVersion,
        catalogueVersionAfter: input.expectedVersion + 1,
        changedFields: [input.kind === 'GEOGRAPHY' ? 'geographyEvidence' : 'occupancyEvidence'],
      },
    })
    return { id, version: input.expectedVersion + 1 }
  })
}
