import { randomUUID } from 'node:crypto'
import type { AuthenticatedActor } from '@api/modules/account/security-access'
import { DomainError } from '@api/modules/domain-error'
import { moneyDigestPostSchema } from '@api/modules/ingestion/parser'
import type { IngestionRuntime, SourceRuntime } from '@api/modules/ingestion/runtime'
import {
  capturePostEnvelope,
  capturePostImages,
  guardPostLease,
  type PostLease,
  processPost,
  recordPostFailure,
  releaseLease,
} from '@api/modules/ingestion/service'
import { readEnvelope } from '@api/modules/ingestion/snapshot'
import { type SourceDefinition, sourceFromRecord } from '@api/modules/ingestion/source'
import { parseSourceIdentity, parseSourcePost } from '@api/modules/ingestion/source-post'
import { appendAdminAudit } from '@api/modules/platform-admin/audit'
import {
  type AccessTransaction,
  accessTransaction,
  type Database,
  requireCurrentAdmin,
} from '@api/modules/platform-admin/transaction'
import {
  type RecoveryRequest,
  type RecoveryResult,
  recoveryResponseSchema,
} from '@broke-oclock/contracts/ingestion-recovery'

export const providerFor = (
  runtime: IngestionRuntime,
  definition: SourceDefinition,
): SourceRuntime | null => {
  const candidate =
    runtime.sourceRuntime?.(definition) ??
    runtime.sources?.find(
      (p) =>
        p.source.provider === definition.provider &&
        p.source.externalId === definition.externalId &&
        p.source.url === definition.url,
    )
  if (
    candidate &&
    candidate.source.provider === definition.provider &&
    candidate.source.externalId === definition.externalId &&
    candidate.source.url === definition.url
  )
    return candidate
  return definition.kind === 'moneydigest'
    ? {
        source: definition,
        reuseApproved: runtime.reuseApproved,
        listPosts: async (options) => ({
          posts: await runtime.listPosts(options),
          nextCursor: null,
        }),
      }
    : null
}
// The same identity-only provider parsers protect both read capabilities and
// admission. A verified hash proves bytes, not ownership of the confirmed post.
export const readTargetEnvelope = (
  row: Parameters<typeof readEnvelope>[0] & { externalId: string },
  source: SourceDefinition,
) => {
  const input = readEnvelope(row, source)
  if (input === null) return null
  try {
    const externalId =
      source.kind === 'moneydigest' && typeof input === 'object' && input !== null && 'id' in input
        ? String(moneyDigestPostSchema.parse(input).id)
        : parseSourceIdentity(input, source).id
    return externalId === row.externalId ? input : null
  } catch {
    return null
  }
}

const EXECUTION_BUDGET_MS = 90_000
export const recoveryDto = (
  row: Awaited<ReturnType<Database['ingestionRecovery']['findUniqueOrThrow']>>,
  now = new Date(),
  owner?: Pick<
    Awaited<ReturnType<Database['importSource']['findUniqueOrThrow']>>,
    'leaseToken' | 'leaseExpiresAt'
  > | null,
) => {
  // requestedAt is durably captured at admission from the same `started` clock
  // as the nonrenewable execution budget. Legacy attempts need no additional
  // owner facts to establish expiry. New attempts also retain their exact owner.
  // This is indeterminate evidence, NOT repair or proof of actual completion.
  const executionDeadline = new Date(row.requestedAt.getTime() + EXECUTION_BUDGET_MS)
  const ownerLost =
    row.ownerLeaseToken &&
    owner !== undefined &&
    (!owner ||
      owner.leaseToken !== row.ownerLeaseToken ||
      !owner.leaseExpiresAt ||
      owner.leaseExpiresAt <= now)
  const interrupted =
    (row.status === 'REQUESTED' || row.status === 'RUNNING') &&
    (executionDeadline.getTime() <= now.getTime() || ownerLost)
  return recoveryResponseSchema.parse({
    id: row.id,
    postId: row.postId,
    sourceId: row.sourceId,
    mode: row.mode,
    expectedUpdatedAt: row.expectedUpdatedAt.toISOString(),
    expectedContentHash: row.expectedContentHash,
    note: row.note,
    status: interrupted ? 'INTERRUPTED' : row.status,
    targetOutcome: interrupted ? 'UNKNOWN' : row.targetOutcome,
    runId: row.runId,
    errorCode: row.errorCode,
    requestedAt: row.requestedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  })
}
export const getRecovery = async (db: Database, id: string) => {
  const row = await db.ingestionRecovery.findUnique({ where: { id } })
  if (!row) throw new DomainError('NOT_FOUND')
  const owner = await db.importSource.findUnique({
    where: { id: row.sourceId },
    select: { leaseToken: true, leaseExpiresAt: true },
  })
  return recoveryDto(row, new Date(), owner)
}
const leaseWhere = (sourceId: string, now: Date) => ({
  id: sourceId,
  enabled: true,
  OR: [
    { leaseExpiresAt: null },
    { leaseExpiresAt: { isSet: false } },
    { leaseExpiresAt: { lte: now } },
  ],
})

export const recoverPost = async (
  db: Database,
  runtime: IngestionRuntime,
  actor: AuthenticatedActor,
  postId: string,
  input: RecoveryRequest,
): Promise<RecoveryResult> => {
  const started = runtime.now()
  const deadline = new Date(started.getTime() + EXECUTION_BUDGET_MS)
  runtime = { ...runtime, deadline }
  const token = randomUUID()
  const admitted = await accessTransaction(db, async (tx) => {
    const admin = await requireCurrentAdmin(tx, actor)
    const post = await tx.importedPost.findUnique({
      where: { id: postId },
      include: { source: true },
    })
    if (!post) throw new DomainError('NOT_FOUND')
    if (
      post.updatedAt.toISOString() !== input.expectedUpdatedAt ||
      post.contentHash !== input.expectedContentHash
    )
      throw new DomainError('CONFLICT', 'Post changed; refresh captured evidence')
    const definition = sourceFromRecord(post.source)
    if (!definition || !runtime.enabled || !post.source.enabled)
      throw new DomainError(
        'PRECONDITION_FAILED',
        'Supported enabled source and ingestion opt-in required',
      )
    const provider = providerFor(runtime, definition)
    if (!provider?.reuseApproved)
      throw new DomainError('PRECONDITION_FAILED', 'Source reuse approval required')
    const stored = input.mode === 'REPROCESS_STORED' ? readTargetEnvelope(post, definition) : null
    if (input.mode === 'REPROCESS_STORED' && !stored)
      throw new DomainError(
        'PRECONDITION_FAILED',
        'Validated exact stored envelope unavailable; rawContent cannot be reconstructed',
      )
    const claimed = await tx.importSource.updateMany({
      where: {
        ...leaseWhere(post.sourceId, started),
        provider: definition.provider,
        externalId: definition.externalId,
        url: definition.url,
      },
      data: { leaseToken: token, leaseExpiresAt: new Date(started.getTime() + 120_000) },
    })
    if (claimed.count !== 1) throw new DomainError('CONFLICT', 'Source is busy')
    const recent = await tx.ingestionRun.findFirst({
      where: { sourceId: post.sourceId },
      orderBy: { startedAt: 'desc' },
    })
    if (recent && started.getTime() - recent.startedAt.getTime() < 30_000)
      throw new DomainError('TOO_MANY_REQUESTS', 'Source request cooldown')
    const cas = await tx.importedPost.updateMany({
      where: { id: post.id, updatedAt: post.updatedAt, contentHash: input.expectedContentHash },
      data: { updatedAt: new Date(Math.max(started.getTime(), post.updatedAt.getTime() + 1)) },
    })
    if (cas.count !== 1) throw new DomainError('CONFLICT', 'Post changed')
    const run = await tx.ingestionRun.create({
      data: { sourceId: post.sourceId, startedAt: started, status: 'RUNNING' },
    })
    const recovery = await tx.ingestionRecovery.create({
      data: {
        actorId: admin.id,
        actorName: admin.name,
        postId,
        sourceId: post.sourceId,
        mode: input.mode,
        expectedUpdatedAt: post.updatedAt,
        expectedContentHash: post.contentHash,
        note: input.note,
        status: 'REQUESTED',
        targetOutcome: 'UNKNOWN',
        runId: run.id,
        requestedAt: started,
        ownerLeaseToken: token,
      },
    })
    await appendAdminAudit(tx, admin, {
      action: 'INGESTION_RECOVERY_REQUESTED',
      subjectType: 'INGESTION_RECOVERY',
      subjectId: recovery.id,
      note: input.note,
      details: { mode: input.mode, runId: run.id, newStatus: 'REQUESTED' },
    })
    return {
      post,
      definition,
      provider,
      stored,
      recovery,
      admin,
      lease: {
        sourceId: post.sourceId,
        token,
        run,
        definition,
        cursor: post.source.cursor,
        actor,
      } satisfies PostLease,
    }
  })
  const { lease, recovery, provider } = admitted
  let status: RecoveryResult['status'] = 'SUCCEEDED'
  let targetOutcome: RecoveryResult['targetOutcome'] = 'NOT_OBSERVED'
  let errorCode: string | null = null
  let fetchedCount = 0
  let createdCount = 0
  let updatedCount = 0
  let failedCount = 0
  const protect = () => accessTransaction(db, (tx) => guardPostLease(tx, runtime, lease))
  const execute = async () => {
    await accessTransaction(db, async (tx) => {
      await guardPostLease(tx, runtime, lease)
      await tx.ingestionRecovery.update({ where: { id: recovery.id }, data: { status: 'RUNNING' } })
    })
    let inputs: readonly unknown[] = admitted.stored ? [admitted.stored] : []
    if (input.mode === 'REFRESH_SOURCE_WINDOW') {
      const observed: unknown[] = []
      let cursor: string | null = null
      for (let page = 1; page <= 2; page++) {
        await protect()
        const result = await provider.listPosts({ page, perPage: 20, cursor })
        if (
          !Array.isArray(result.posts) ||
          result.posts.length > 20 ||
          (result.nextCursor !== null && !/^[1-9]\d{0,14}$/u.test(result.nextCursor))
        )
          throw new Error('INVALID_PAGE')
        observed.push(...result.posts)
        fetchedCount += result.posts.length
        cursor = result.nextCursor
        if (!cursor) break
      }
      // A source window is discovery, not an implicit global run or cursor rewind.
      // Only the confirmed target can be mutated by this recovery.
      inputs = observed
        .filter((value) => {
          try {
            const identity =
              admitted.definition.kind === 'moneydigest' &&
              typeof value === 'object' &&
              value !== null &&
              'id' in value
                ? { id: Reflect.get(value, 'id') }
                : parseSourceIdentity(value, admitted.definition)
            return String(identity.id) === admitted.post.externalId
          } catch {
            return false
          }
        })
        .slice(0, 1)
    }
    for (const value of inputs) {
      let stage = 'PARSE'
      try {
        await capturePostEnvelope(db, runtime, lease, value)
        const parsed = parseSourcePost(value, admitted.definition)
        stage = 'MEDIA'
        const images = await capturePostImages(db, runtime, lease, parsed.images)
        stage = 'PERSIST'
        const result = await processPost(db, runtime, lease, value, images)
        if (result === 'created') createdCount++
        if (result === 'updated') updatedCount++
        const post = await db.importedPost.findUniqueOrThrow({ where: { id: postId } })
        targetOutcome =
          post.status === 'FAILED' || post.errorCode
            ? 'STILL_FAILED'
            : result === 'unchanged' || (result === 'linked' && admitted.post.status !== 'FAILED')
              ? 'UNCHANGED'
              : 'RECOVERED'
      } catch (error) {
        if (
          error instanceof DomainError &&
          ['UNAUTHORIZED', 'FORBIDDEN', 'CONFLICT'].includes(error.code)
        )
          throw error
        failedCount++
        errorCode = 'INGESTION_FAILED'
        targetOutcome = 'STILL_FAILED'
        status = 'FAILED'
        await recordPostFailure(db, runtime, lease, value, errorCode, stage)
      }
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      execute(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new DomainError('CONFLICT', 'Recovery budget exhausted')),
          EXECUTION_BUDGET_MS,
        )
      }),
    ])
    await accessTransaction(db, async (tx) => {
      await guardPostLease(tx, runtime, lease)
      await finish(tx, status, targetOutcome, errorCode)
    })
  } catch (error) {
    status = 'INTERRUPTED'
    targetOutcome = 'UNKNOWN'
    errorCode = error instanceof DomainError ? error.code : 'INGESTION_FAILED'
    // Outcome-only bookkeeping for the admitted recovery ID. This cannot mutate
    // a post, citation, deal, source identity, cursor, opt-in or approval after revocation.
    await db.$transaction(async (tx) => {
      // Recovery identity authorizes outcome-only terminal bookkeeping even after
      // lease theft. Never touch the successor owner's source reservation.
      await finish(tx, status, targetOutcome, errorCode)
    })
  } finally {
    if (timer) clearTimeout(timer)
    await releaseLease(db, lease.sourceId, token)
  }
  return getRecovery(db, recovery.id)
  async function finish(
    tx: AccessTransaction,
    finalStatus: RecoveryResult['status'],
    outcome: RecoveryResult['targetOutcome'],
    code: string | null,
  ) {
    const terminal = await tx.ingestionRecovery.updateMany({
      where: { id: recovery.id, status: { in: ['REQUESTED', 'RUNNING'] } },
      data: {
        status: finalStatus,
        targetOutcome: outcome,
        errorCode: code,
        finishedAt: runtime.now(),
      },
    })
    if (terminal.count !== 1) throw new DomainError('CONFLICT', 'Recovery already finished')
    await tx.ingestionRun.update({
      where: { id: lease.run.id },
      data: {
        status:
          finalStatus === 'INTERRUPTED'
            ? 'FAILED'
            : finalStatus === 'SUCCEEDED'
              ? 'SUCCEEDED'
              : 'FAILED',
        fetchedCount,
        createdCount,
        updatedCount,
        failedCount,
        errorCode: code,
        finishedAt: runtime.now(),
      },
    })
    await appendAdminAudit(tx, admitted.admin, {
      action: 'INGESTION_RECOVERY_FINISHED',
      subjectType: 'INGESTION_RECOVERY',
      subjectId: recovery.id,
      note: input.note,
      details: {
        mode: input.mode,
        runId: lease.run.id,
        newStatus: finalStatus,
        targetOutcome: outcome,
        ...(code ? { errorCode: code } : {}),
      },
    })
  }
}
