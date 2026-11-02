import type { AccessTransaction } from '@api/modules/platform-admin/transaction'

export type RequestInvalidationActor =
  | { id: string; name: string; kind?: 'HUMAN'; source?: 'ADMIN' }
  | { id: null; name: string; kind: 'SYSTEM'; source: 'NATIVE_AUTH' }

// Must run within the shared fenced role/revoke transaction. A later approval
// cannot resurrect a request reviewed against a superseded permission context.
export const invalidatePendingRequests = async (
  tx: AccessTransaction,
  actor: RequestInvalidationActor,
  userId: string,
  reason: string,
  venueId?: string,
) => {
  const requests = await tx.merchantAccessRequest.findMany({
    where: { userId, venueId, status: 'PENDING' },
  })
  for (const request of requests) {
    await tx.merchantAccessRequest.update({
      where: { id: request.id },
      data: {
        status: 'REJECTED',
        version: { increment: 1 },
        reviewNote: reason,
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
    })
    await tx.platformAudit.create({
      data: {
        actorId: actor.id,
        actorKind: actor.kind ?? 'HUMAN',
        actorSource: actor.source ?? 'ADMIN',
        actorName: actor.name,
        action: 'REQUEST_REJECTED',
        targetUserId: userId,
        venueId: request.venueId,
        note: reason,
        roleBefore: null,
        roleAfter: null,
      },
    })
  }
  return requests.length
}
