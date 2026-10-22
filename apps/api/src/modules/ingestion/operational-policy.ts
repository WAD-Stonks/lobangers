import { importedDealScope } from '@api/modules/ingestion/review-policy'
import type { IngestionRuntime } from '@api/modules/ingestion/runtime'
import { MONEYDIGEST_SOURCE, sourceFromRecord, sourceWhere } from '@api/modules/ingestion/source'
import type { Database } from '@api/modules/platform-admin/transaction'

// Use the review queue's supported publisher scope, not today's enabled/approved
// providers: switching a source off must never erase its failures or run history.
// In particular this does not admit arbitrary legacy WordPress publishers.
export const operationalSourceScope = importedDealScope.sources.some.importedPost.source

export const readIngestionReadiness = async (
  db: Database,
  runtime: IngestionRuntime | undefined,
) => {
  const ingestionOptIn = runtime?.enabled ?? false
  const multiSource = Boolean(runtime?.sourceRuntime || runtime?.sources)
  if (!multiSource) {
    const source = await db.importSource.findUnique({ where: sourceWhere })
    const sourceIdentityValid = Boolean(source && sourceFromRecord(source)?.kind === 'moneydigest')
    const sourceRecordEnabled = source?.enabled ?? false
    const reuseAttested = runtime?.reuseApproved ?? false
    return {
      name: MONEYDIGEST_SOURCE.name,
      ingestionOptIn,
      sourceRecordEnabled,
      sourceIdentityValid,
      reuseAttested,
      importAllowed: ingestionOptIn && reuseAttested && sourceRecordEnabled && sourceIdentityValid,
    }
  }

  // Match the registry-backed worker's bounded admission order. Constructing a
  // SourceRuntime is pure: readiness never invokes listPosts or another provider.
  const registered = await db.importSource.findMany({
    where: { enabled: true },
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: 50,
  })
  const seen = new Set<string>()
  const supported = registered.flatMap((row) => {
    const definition = sourceFromRecord(row)
    if (!definition) return []
    const key = `${definition.provider}:${definition.externalId.toLowerCase()}`
    if (seen.has(key)) return []
    seen.add(key)
    return [definition]
  })
  const admitted = runtime?.sourceRuntime ? supported.slice(0, 10) : supported
  const reuseAttested = admitted.some((definition) => {
    if (runtime?.sourceRuntime) return runtime.sourceRuntime(definition).reuseApproved
    return (
      runtime?.sources?.some(
        (provider) =>
          provider.reuseApproved &&
          provider.source.provider === definition.provider &&
          provider.source.externalId === definition.externalId &&
          provider.source.url === definition.url,
      ) ?? false
    )
  })
  return {
    name: 'Registered sources',
    ingestionOptIn,
    sourceRecordEnabled: registered.length > 0,
    sourceIdentityValid: supported.length > 0,
    reuseAttested,
    importAllowed: ingestionOptIn && reuseAttested,
  }
}
