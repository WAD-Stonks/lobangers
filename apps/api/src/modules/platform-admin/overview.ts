import type { AppConfig } from '@api/config'
import { resolveImportedDealReadScope } from '@api/modules/ingestion/imported-read-scope'
import {
  operationalSourceScope,
  readIngestionReadiness,
} from '@api/modules/ingestion/operational-policy'
import type { RestContext } from '@api/rest/context'
import { adminOverviewResponseSchema } from '@broke-oclock/contracts/platform-admin'

export const readAdminOverview = async (context: RestContext, config: AppConfig) => {
  const generatedAt = (context.ingestion?.now() ?? new Date()).toISOString()
  const [readiness, importedScope] = await Promise.all([
    readIngestionReadiness(context.db, context.ingestion),
    resolveImportedDealReadScope(context.db),
  ])
  const [pendingMerchantRequests, pendingImportedDrafts, failedImportedPosts, runs] =
    await Promise.all([
      context.db.merchantAccessRequest.count({ where: { status: 'PENDING' } }),
      context.db.deal.count({ where: { ...importedScope, reviewStatus: 'PENDING' } }),
      context.db.importedPost.count({
        where: { source: operationalSourceScope, status: 'FAILED' },
      }),
      context.db.ingestionRun.findMany({
        where: { source: operationalSourceScope },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 10,
        select: {
          id: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          fetchedCount: true,
          createdCount: true,
          updatedCount: true,
          failedCount: true,
          errorCode: true,
          source: { select: { name: true } },
        },
      }),
    ])

  return adminOverviewResponseSchema.parse({
    generatedAt,
    counts: { pendingMerchantRequests, pendingImportedDrafts, failedImportedPosts },
    recentRuns: runs.map((row) => ({
      id: row.id,
      sourceName: row.source.name,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      fetchedCount: row.fetchedCount,
      createdCount: row.createdCount,
      updatedCount: row.updatedCount,
      failedCount: row.failedCount,
      errorCode: row.errorCode,
    })),
    readiness: {
      googleConfigured: Boolean(config.authProviders?.google),
      emailConfigured: Boolean(config.authProviders?.email),
      oneMapConfigured: Boolean(context.ingestion?.searchLocations),
      ingestionOptIn: readiness.ingestionOptIn,
      reuseAttested: readiness.reuseAttested,
      sourceRecordEnabled: readiness.sourceRecordEnabled,
      sourceIdentityValid: readiness.sourceIdentityValid,
      importAllowed: readiness.importAllowed,
      liveProviderAcceptance: 'NOT_ESTABLISHED',
    },
  })
}
