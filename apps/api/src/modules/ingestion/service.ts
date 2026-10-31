import { createHash, randomUUID } from 'node:crypto'
import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import { moneyDigestPostSchema } from '@api/modules/ingestion/parser'
import { promotionIdentity } from '@api/modules/ingestion/promotion-identity'
import type { IngestionRuntime, SourceRuntime } from '@api/modules/ingestion/runtime'
import { captureEnvelope } from '@api/modules/ingestion/snapshot'
import {
  MONEYDIGEST_SOURCE,
  type SourceDefinition,
  sourceFromRecord,
  sourceKey,
} from '@api/modules/ingestion/source'
import {
  type CapturedImage,
  captureSourceImages,
  imageLinks,
} from '@api/modules/ingestion/source-images'
import { parseSourceIdentity, parseSourcePost } from '@api/modules/ingestion/source-post'
import { legacyVersionWhere, normalizeVersion } from '@api/modules/platform-admin/operation-version'
import {
  type AccessTransaction,
  fencePlatformAccess,
  requireCurrentAdmin,
} from '@api/modules/platform-admin/transaction'
import type { db } from '@broke-oclock/db'
import { z } from 'zod'

type Database = typeof db
const LEASE_MS = 120_000
const COOLDOWN_MS = 30_000
const retryWrite = async <T>(operation: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation()
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? error.code : null
      if (attempt >= 4 || (code !== 'P2002' && code !== 'P2034')) throw error
      await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt))
    }
  }
}
const retryAdmission = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await retryWrite(operation)
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? error.code : null
    if (['P2002', 'P2034', 'P2025'].includes(String(code)))
      throw new DomainError('CONFLICT', 'Source admission changed; refresh before trying again')
    throw error
  }
}
const safeErrorCode = (error: unknown) => {
  if (error instanceof z.ZodError) return 'MALFORMED_POST'
  const code = typeof error === 'object' && error && 'code' in error ? error.code : null
  return typeof code === 'string' &&
    ['TIMEOUT', 'NETWORK_ERROR', 'HTTP_ERROR', 'MALFORMED_RESPONSE', 'CONFLICT'].includes(code)
    ? code
    : 'INGESTION_FAILED'
}
export const releaseLease = (db: Database, sourceId: string, token: string) =>
  db.importSource.updateMany({
    where: { id: sourceId, leaseToken: token },
    data: { leaseToken: null, leaseExpiresAt: null },
  })
export const acquireLease = async (
  db: Database,
  now: Date,
  definition: SourceDefinition = { kind: 'moneydigest', ...MONEYDIGEST_SOURCE },
  actor?: AuthenticatedActor,
) => {
  // Bootstrap remains durable even when the default source is disabled. Manual
  // admission authorizes this write too; no actorless seed is made on its behalf.
  const { kind: _, ...identity } = definition
  const source = await retryAdmission(() =>
    db.$transaction(async (tx) => {
      if (actor) {
        await fencePlatformAccess(tx)
        await requireCurrentAdmin(tx, actor)
      }
      return tx.importSource.upsert({
        where: sourceKey(definition),
        create: { ...identity, enabled: false },
        update: {},
      })
    }),
  )
  if (!source.enabled || source.url !== definition.url)
    throw new DomainError('PRECONDITION_FAILED', 'Approved source is disabled')
  return retryAdmission(() =>
    db.$transaction(async (tx) => {
      if (actor) {
        await fencePlatformAccess(tx)
        await requireCurrentAdmin(tx, actor)
      }
      const current = await tx.importSource.findUniqueOrThrow({ where: { id: source.id } })
      const token = randomUUID()
      const lease = await tx.importSource.updateMany({
        where: {
          id: source.id,
          enabled: true,
          url: definition.url,
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { isSet: false } },
            { leaseExpiresAt: { lte: now } },
          ],
        },
        data: { leaseToken: token, leaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
      })
      if (lease.count !== 1) throw new DomainError('CONFLICT', 'Source is busy')
      const recent = await tx.ingestionRun.findFirst({
        where: { sourceId: source.id },
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true },
      })
      if (recent && now.getTime() - recent.startedAt.getTime() < COOLDOWN_MS)
        throw new DomainError('TOO_MANY_REQUESTS', 'Source request cooldown')
      const run = await tx.ingestionRun.create({
        data: { source: { connect: { id: source.id } }, startedAt: now, status: 'RUNNING' },
      })
      return { sourceId: source.id, token, run, definition, cursor: current.cursor }
    }),
  )
}
export type PostLease = Awaited<ReturnType<typeof acquireLease>> & { actor?: AuthenticatedActor }
type Lease = PostLease
export const guardPostLease = async (
  tx: AccessTransaction,
  runtime: IngestionRuntime,
  lease: Lease,
) => {
  if (runtime.deadline && runtime.now() >= runtime.deadline)
    throw new DomainError('CONFLICT', 'Recovery budget exhausted')
  if (lease.actor) {
    await fencePlatformAccess(tx)
    await requireCurrentAdmin(tx, lease.actor)
  }
  const fence = await tx.importSource.updateMany({
    where: {
      id: lease.sourceId,
      enabled: true,
      provider: lease.definition.provider,
      externalId: lease.definition.externalId,
      url: lease.definition.url,
      leaseToken: lease.token,
      leaseExpiresAt: { gt: runtime.now() },
    },
    data: { leaseToken: lease.token },
  })
  if (fence.count !== 1) throw new DomainError('CONFLICT', 'Source lease expired or disabled')
}
export const processPost = async (
  db: Database,
  runtime: IngestionRuntime,
  lease: Lease,
  input: unknown,
  images: CapturedImage[] = [],
) => {
  const parsed = parseSourcePost(input, lease.definition)
  const { post, draft } = parsed
  const snapshot = captureEnvelope(input, lease.definition).latestSnapshot
  const contentHash = createHash('sha256').update(snapshot).digest('hex')
  return db.$transaction(async (tx) => {
    await guardPostLease(tx, runtime, lease)
    const fence = await tx.importSource.updateMany({
      where: {
        id: lease.sourceId,
        enabled: true,
        url: lease.definition.url,
        leaseToken: lease.token,
        leaseExpiresAt: { gt: runtime.now() },
      },
      data: { leaseToken: lease.token },
    })
    if (fence.count !== 1) throw new DomainError('CONFLICT', 'Source lease expired')
    const previous = await tx.importedPost.findUnique({
      where: { sourceId_externalId: { sourceId: lease.sourceId, externalId: String(post.id) } },
      include: {
        deals: { include: { deal: { include: { _count: { select: { sources: true } } } } } },
      },
    })
    if (previous?.processedContentHash === contentHash && previous.status !== 'FAILED')
      return 'unchanged'
    const identity = draft ? promotionIdentity(parsed) : null
    const canonical = identity
      ? await tx.promotionIdentity.findUnique({ where: { id: identity } })
      : null
    const unchangedPromotion = canonical
      ? previous?.deals.find((link) => link.dealId === canonical.dealId)
      : undefined
    const pending =
      previous?.deals.filter(
        (link) =>
          link.deal.reviewStatus === 'PENDING' &&
          !link.deal.deletedAt &&
          link.deal._count.sources === 1,
      ) ?? []
    const protectedContent =
      previous?.deals.some((link) => link.deal.reviewStatus === 'APPROVED') ?? false
    const replacePending = Boolean(draft && pending.length && !unchangedPromotion)
    const sourceChanged = Boolean(previous?.deals.length && !replacePending && !unchangedPromotion)
    const metadata = {
      url: post.link,
      title: draft?.title ?? null,
      rawContent: post.content.rendered,
      // Exact promotion evidence is unchanged: retain its pinned evidence hash/citation,
      // while processedContentHash tracks the newly observed transport snapshot.
      contentHash: unchangedPromotion?.sourceContentHash ?? contentHash,
      status: sourceChanged ? ('NEEDS_REVIEW' as const) : parsed.status,
      processedContentHash: contentHash,
      processedAt: runtime.now(),
      failureStage: null,
      lastRunId: lease.run.id,
      fetchedAt: runtime.now(),
      errorCode:
        previous?.errorCode === 'SOURCE_CHANGED'
          ? 'SOURCE_CHANGED'
          : !unchangedPromotion && (protectedContent || sourceChanged)
            ? 'SOURCE_CHANGED'
            : null,
    }
    const imported = await tx.importedPost.upsert({
      where: { sourceId_externalId: { sourceId: lease.sourceId, externalId: String(post.id) } },
      create: {
        source: { connect: { id: lease.sourceId } },
        externalId: String(post.id),
        ...metadata,
      },
      update: metadata,
    })
    if (!draft) return 'unchanged'
    if (canonical) {
      const deal = await tx.deal.findUnique({ where: { id: canonical.dealId } })
      if (deal && !deal.deletedAt) {
        if (!unchangedPromotion) {
          const version = normalizeVersion(deal.operationVersion)
          const parent = await tx.deal.updateMany({
            where: {
              id: deal.id,
              reviewStatus: deal.reviewStatus,
              contentVersion: deal.contentVersion,
              AND: [
                legacyVersionWhere('operationVersion', version),
                { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
              ],
            },
            data: { operationVersion: version + 1 },
          })
          if (parent.count !== 1) throw new DomainError('CONFLICT', 'Canonical promotion changed')
          await tx.dealSource.create({
            data: {
              dealId: deal.id,
              importedPostId: imported.id,
              sourceContentHash: contentHash,
              sourceContentSnapshot: snapshot,
              sourceUrl: post.link,
              images: imageLinks(images),
            },
          })
        }
        return 'linked'
      }
      throw new DomainError('CONFLICT', 'Canonical promotion is unavailable')
    }
    const contentVersion = previous?.deals.length
      ? Math.max(...previous.deals.map((link) => link.deal.contentVersion)) + 1
      : 1
    // DealSource is immutable. Refresh by replacing the pending revision, not rewriting its citation.
    for (const link of pending) {
      const changed = await tx.deal.updateMany({
        where: {
          id: link.dealId,
          reviewStatus: 'PENDING',
          contentVersion: link.deal.contentVersion,
          AND: [
            legacyVersionWhere('operationVersion', normalizeVersion(link.deal.operationVersion)),
            { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
          ],
        },
        data: {
          reviewStatus: 'REJECTED',
          operationVersion: normalizeVersion(link.deal.operationVersion) + 1,
          contentVersion: { increment: 1 },
          reviewNote: 'Superseded by source revision',
          reviewedVersion: null,
          reviewedById: null,
          reviewedAt: null,
          publishedAt: null,
        },
      })
      if (changed.count !== 1) throw new DomainError('CONFLICT', 'Draft changed')
    }
    const created = await tx.deal.create({
      data: {
        ...draft,
        operationVersion: 0,
        origin: 'IMPORTED',
        reviewStatus: 'PENDING',
        contentVersion,
        sources: {
          create: {
            importedPost: { connect: { id: imported.id } },
            sourceContentHash: contentHash,
            sourceContentSnapshot: snapshot,
            sourceUrl: post.link,
            images: imageLinks(images),
          },
        },
      },
    })
    if (identity && !canonical)
      await tx.promotionIdentity.create({ data: { id: identity, dealId: created.id } })
    return replacePending ? 'updated' : 'created'
  })
}
export const recordPostFailure = async (
  db: Database,
  runtime: IngestionRuntime,
  lease: Lease,
  input: unknown,
  errorCode: string,
  failureStage = 'PARSE',
) => {
  let identity: { id: string | number; link: string }
  try {
    identity =
      lease.definition.kind === 'moneydigest' && typeof input === 'object' && input && 'id' in input
        ? moneyDigestPostSchema.pick({ id: true, link: true }).parse(input)
        : parseSourceIdentity(input, lease.definition)
  } catch {
    return
  }
  await db.$transaction(async (tx) => {
    await guardPostLease(tx, runtime, lease)
    const fence = await tx.importSource.updateMany({
      where: {
        id: lease.sourceId,
        enabled: true,
        url: lease.definition.url,
        leaseToken: lease.token,
        leaseExpiresAt: { gt: runtime.now() },
      },
      data: { leaseToken: lease.token },
    })
    if (fence.count !== 1) return
    const { id, link } = identity
    // Read and preserve the blocker under the same source/actor write fence as
    // the failure update. A new attempt is not a successful processing receipt.
    const previous = await tx.importedPost.findUnique({
      where: { sourceId_externalId: { sourceId: lease.sourceId, externalId: String(id) } },
      select: { errorCode: true },
    })
    const sourceChanged = previous?.errorCode === 'SOURCE_CHANGED'
    await tx.importedPost.upsert({
      where: { sourceId_externalId: { sourceId: lease.sourceId, externalId: String(id) } },
      create: {
        source: { connect: { id: lease.sourceId } },
        externalId: String(id),
        url: link,
        rawContent: '',
        contentHash: createHash('sha256').update(`failed:${id}`).digest('hex'),
        status: 'FAILED',
        errorCode,
        failureStage,
        lastRunId: lease.run.id,
        fetchedAt: runtime.now(),
      },
      update: {
        status: 'FAILED',
        errorCode: sourceChanged ? 'SOURCE_CHANGED' : errorCode,
        failureStage,
        ...(sourceChanged ? {} : { processedContentHash: null, processedAt: null }),
        lastRunId: lease.run.id,
        fetchedAt: runtime.now(),
      },
    })
  })
}
export const capturePostEnvelope = async (
  db: Database,
  runtime: IngestionRuntime,
  lease: Lease,
  input: unknown,
) => {
  const envelope = captureEnvelope(input, lease.definition)
  const identity =
    envelope.snapshotFormat === 'moneydigest-v1'
      ? moneyDigestPostSchema.pick({ id: true, link: true }).parse(input)
      : parseSourceIdentity(input, lease.definition)
  await db.$transaction(async (tx) => {
    await guardPostLease(tx, runtime, lease)
    const fence = await tx.importSource.updateMany({
      where: {
        id: lease.sourceId,
        enabled: true,
        url: lease.definition.url,
        leaseToken: lease.token,
        leaseExpiresAt: { gt: runtime.now() },
      },
      data: { leaseToken: lease.token },
    })
    if (fence.count !== 1) throw new DomainError('CONFLICT', 'Source lease expired')
    const metadata = { ...envelope, fetchedAt: runtime.now(), lastRunId: lease.run.id }
    await tx.importedPost.upsert({
      where: { sourceId_externalId: { sourceId: lease.sourceId, externalId: String(identity.id) } },
      create: {
        sourceId: lease.sourceId,
        externalId: String(identity.id),
        url: identity.link,
        rawContent: '',
        contentHash: envelope.latestSnapshotHash,
        ...metadata,
      },
      update: metadata,
    })
  })
}
// Media storage may pause at a provider promise. Fence each local write in its
// own transaction, never keep a database transaction open across remote I/O.
const controlledMediaDatabase = (db: Database, runtime: IngestionRuntime, lease: Lease): Database =>
  new Proxy(db, {
    get(target, key, receiver) {
      if (key !== 'importedImage') return Reflect.get(target, key, receiver)
      return new Proxy(target.importedImage, {
        get(delegate, method, delegateReceiver) {
          const original: unknown = Reflect.get(delegate, method, delegateReceiver)
          if (method === 'create' || method === 'updateMany')
            return (...args: unknown[]) =>
              retryWrite(() =>
                db.$transaction(async (tx) => {
                  await guardPostLease(tx, runtime, lease)
                  return Reflect.apply(tx.importedImage[method], tx.importedImage, args)
                }),
              )
          return typeof original === 'function' ? original.bind(delegate) : original
        },
      })
    },
  })
export const capturePostImages = async (
  db: Database,
  runtime: IngestionRuntime,
  lease: Lease,
  images: Parameters<typeof captureSourceImages>[3],
) => {
  const mediaFence = () =>
    retryWrite(() => db.$transaction((tx) => guardPostLease(tx, runtime, lease)))
  const imageStorage = runtime.imageStorage
  const mediaRuntime: IngestionRuntime = {
    ...runtime,
    ...(imageStorage
      ? {
          imageStorage: {
            upload: async (image, customId) => {
              await mediaFence()
              return imageStorage.upload(image, customId)
            },
            resolve: async (customId) => {
              await mediaFence()
              return imageStorage.resolve(customId)
            },
          },
        }
      : {}),
  }
  const mediaDatabase = controlledMediaDatabase(db, runtime, lease)
  return captureSourceImages(mediaDatabase, mediaRuntime, lease.definition, images, mediaFence)
}
const runSource = async (
  db: Database,
  runtime: IngestionRuntime,
  provider?: SourceRuntime,
  actor?: AuthenticatedActor,
) => {
  if (!runtime.enabled || !runtime.reuseApproved)
    throw new DomainError('PRECONDITION_FAILED', 'Ingestion and source reuse approval are required')
  const definition = provider?.source ?? { kind: 'moneydigest' as const, ...MONEYDIGEST_SOURCE }
  const lease: Lease = { ...(await acquireLease(db, runtime.now(), definition, actor)), actor }
  let fetchedCount = 0
  let createdCount = 0
  let updatedCount = 0
  let failedCount = 0
  let errorCode: string | null = null
  let providerFailed = false
  try {
    // Re-fence immediately at the external-request boundary. Persist its actual
    // start so a later process applies cooldown even if this process crashes.
    const requestPage = async (options: {
      page: number
      perPage: number
      cursor: string | null
    }) => {
      if (runtime.deadline && runtime.now() >= runtime.deadline)
        throw new DomainError('CONFLICT', 'Run budget exhausted')
      const requestedAt = runtime.now()
      await db.$transaction(async (tx) => {
        await guardPostLease(tx, runtime, lease)
        const fence = await tx.importSource.updateMany({
          where: {
            id: lease.sourceId,
            enabled: true,
            url: definition.url,
            leaseToken: lease.token,
            leaseExpiresAt: { gt: requestedAt },
          },
          data: { leaseToken: lease.token },
        })
        if (fence.count !== 1) throw new DomainError('CONFLICT', 'Source lease expired')
        await tx.ingestionRun.update({
          where: { id: lease.run.id },
          data: { startedAt: requestedAt },
        })
      })
      const result = provider
        ? await provider.listPosts(options)
        : {
            posts: await runtime.listPosts({ page: options.page, perPage: options.perPage }),
            nextCursor: null,
          }
      if (
        !Array.isArray(result.posts) ||
        result.posts.length > 20 ||
        (result.nextCursor !== null && !/^[1-9]\d{0,14}$/u.test(result.nextCursor))
      )
        throw new Error('INVALID_PAGE')
      return result
    }
    const page = await requestPage({ page: 1, perPage: 20, cursor: null })
    const history =
      provider && lease.cursor
        ? await requestPage({
            page: definition.kind === 'telegram' ? 2 : Number(lease.cursor),
            perPage: 20,
            cursor: lease.cursor,
          })
        : null
    const posts = [...page.posts, ...(history?.posts ?? [])]
    fetchedCount = posts.length
    for (const input of posts) {
      let failureStage = 'PARSE'
      try {
        await capturePostEnvelope(db, runtime, lease, input)
        const parsed = parseSourcePost(input, lease.definition)
        const contentHash = createHash('sha256')
          .update(captureEnvelope(input, lease.definition).latestSnapshot)
          .digest('hex')
        const previous = await db.importedPost.findUnique({
          where: {
            sourceId_externalId: { sourceId: lease.sourceId, externalId: String(parsed.post.id) },
          },
          select: { processedContentHash: true },
        })
        failureStage = 'MEDIA'
        const images =
          previous?.processedContentHash === contentHash
            ? []
            : await capturePostImages(db, runtime, lease, parsed.images)
        failureStage = 'PERSIST'
        const outcome = await retryWrite(() => processPost(db, runtime, lease, input, images))
        if (outcome === 'created') createdCount++
        if (outcome === 'updated') updatedCount++
      } catch (error) {
        failedCount++
        errorCode = safeErrorCode(error)
        await retryWrite(() =>
          recordPostFailure(
            db,
            runtime,
            lease,
            input,
            errorCode ?? 'INGESTION_FAILED',
            failureStage,
          ),
        )
      }
    }
    if (provider) {
      await db.$transaction(async (tx) => {
        await guardPostLease(tx, runtime, lease)
        const advanced = await tx.importSource.updateMany({
          where: {
            id: lease.sourceId,
            enabled: true,
            url: definition.url,
            leaseToken: lease.token,
            leaseExpiresAt: { gt: runtime.now() },
          },
          data: { cursor: history ? history.nextCursor : page.nextCursor },
        })
        if (advanced.count !== 1)
          throw new DomainError('CONFLICT', 'Source lease expired or disabled')
      })
    }
  } catch (error) {
    providerFailed = true
    errorCode = safeErrorCode(error)
  } finally {
    await releaseLease(db, lease.sourceId, lease.token)
  }
  const status =
    providerFailed || (fetchedCount > 0 && failedCount === fetchedCount)
      ? ('FAILED' as const)
      : failedCount
        ? ('PARTIAL' as const)
        : ('SUCCEEDED' as const)
  await db.ingestionRun.update({
    where: { id: lease.run.id },
    data: {
      status,
      fetchedCount,
      createdCount,
      updatedCount,
      failedCount,
      errorCode,
      finishedAt: runtime.now(),
    },
  })
  return { runId: lease.run.id, status, fetchedCount, createdCount, updatedCount, failedCount }
}

// Manual and scheduled callers share this service, durable source leases and IDs.
// One bounded page per source per invocation; run history retains each outcome.
export const runIngestion = async (
  db: Database,
  runtime: IngestionRuntime,
  actor?: AuthenticatedActor,
) => {
  if (!runtime.enabled) throw new DomainError('PRECONDITION_FAILED', 'Ingestion is disabled')
  runtime = { ...runtime, deadline: new Date(runtime.now().getTime() + 90_000) }
  let providers = runtime.sources
  if (runtime.sourceRuntime) {
    // Oldest updated source first: claiming/completing rotates its timestamp, so
    // a bounded run does not perpetually starve channels beyond its first page.
    const registered = await db.importSource.findMany({
      where: { enabled: true },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 50,
    })
    const seen = new Set<string>()
    providers = registered
      .flatMap((row) => {
        const definition = sourceFromRecord(row)
        if (!definition) return []
        const key = `${definition.provider}:${definition.externalId.toLowerCase()}`
        if (seen.has(key)) return []
        seen.add(key)
        return [runtime.sourceRuntime?.(definition)].filter((provider): provider is SourceRuntime =>
          Boolean(provider),
        )
      })
      .slice(0, 10)
  }
  if (!providers) return runSource(db, runtime, undefined, actor)
  const results: Awaited<ReturnType<typeof runSource>>[] = []
  let blocked = 0
  for (const [index, provider] of providers.entries()) {
    if (runtime.deadline && runtime.now() >= runtime.deadline) {
      blocked += providers.length - index
      break
    }
    if (!provider.reuseApproved) continue
    try {
      results.push(
        await runSource(db, { ...runtime, reuseApproved: provider.reuseApproved }, provider, actor),
      )
    } catch (error) {
      if (error instanceof DomainError && error.code === 'PRECONDITION_FAILED') continue
      blocked++
    }
  }
  if (!results.length) {
    if (blocked) throw new DomainError('CONFLICT', 'Sources are busy or unavailable')
    throw new DomainError('PRECONDITION_FAILED', 'Approved sources are disabled')
  }
  const status = results.every((run) => run.status === 'FAILED')
    ? 'FAILED'
    : blocked || results.some((run) => run.status !== 'SUCCEEDED')
      ? 'PARTIAL'
      : 'SUCCEEDED'
  return {
    runId: results[0]?.runId ?? '',
    status,
    fetchedCount: results.reduce((sum, run) => sum + run.fetchedCount, 0),
    createdCount: results.reduce((sum, run) => sum + run.createdCount, 0),
    updatedCount: results.reduce((sum, run) => sum + run.updatedCount, 0),
    failedCount: results.reduce((sum, run) => sum + run.failedCount, blocked),
  }
}
