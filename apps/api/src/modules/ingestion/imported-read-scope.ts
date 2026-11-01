import { importedDealBaseScope, importedDealScope } from '@api/modules/ingestion/review-policy'
import type { Database } from '@api/modules/platform-admin/transaction'
import type { Prisma } from '@broke-oclock/db/constructor'

// Resolve the exact canonical publisher predicate once per read, including disabled
// sources. No cache or registry-page limit: activation is not review eligibility.
// Writes/details retain importedDealScope so their source check stays atomic.
export const resolveImportedDealReadScope = async (db: Pick<Database, 'importSource'>) => {
  const sources = await db.importSource.findMany({
    where: importedDealScope.sources.some.importedPost.source,
    select: { id: true },
  })
  return {
    ...importedDealBaseScope,
    sources: { some: { importedPost: { sourceId: { in: sources.map((source) => source.id) } } } },
  } satisfies Prisma.DealWhereInput
}
