import {
  isSelectableCatalogueVenue,
  type OutletPolicyVenue,
} from '@api/modules/deals/outlet-eligibility'

type ScanVenue = OutletPolicyVenue & { merchant: { deletedAt?: Date | null } | null }

/** An active outlet of an active merchant that cannot be picked for new deals yet. */
export const needsCatalogueVerification = (venue: ScanVenue): boolean =>
  venue.deletedAt == null && venue.merchant?.deletedAt == null && !isSelectableCatalogueVenue(venue)

/** An outlet that can be picked for new deals now. */
export const readyForCatalogueSelection = (venue: ScanVenue): boolean =>
  venue.merchant?.deletedAt == null && isSelectableCatalogueVenue(venue)

/**
 * Pages through id-ordered rows, keeping those the exact policy accepts. Verification depends on
 * proof hashes the database cannot index, so a filtered page is gathered from several batches.
 * When the scan budget runs out first, the cursor resumes after the last row read, so the next
 * page continues the scan instead of claiming the list is complete.
 */
export const scanCataloguePage = async <Row extends { id: string }>(options: {
  fetch: (after: string | undefined, take: number) => Promise<Row[]>
  keep: (row: Row) => boolean
  limit: number
  after?: string
  batch?: number
  budget?: number
}): Promise<{ items: Row[]; nextCursor: string | null }> => {
  const { fetch, keep, limit, batch = 200, budget = 25 } = options
  const kept: Row[] = []
  let after = options.after
  for (let round = 0; round < budget; round++) {
    const rows = await fetch(after, batch)
    for (const row of rows) {
      if (!keep(row)) continue
      kept.push(row)
      if (kept.length > limit)
        return { items: kept.slice(0, limit), nextCursor: kept[limit - 1]?.id ?? null }
    }
    if (rows.length < batch) return { items: kept, nextCursor: null }
    after = rows.at(-1)?.id
  }
  return { items: kept, nextCursor: after ?? null }
}
