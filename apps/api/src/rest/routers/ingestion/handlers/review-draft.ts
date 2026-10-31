import { ApiErrorException } from '@api/errors'
import { fenceDraftEvidence } from '@api/modules/ingestion/draft-evidence'
import {
  hasCurrentSourceScope,
  importedDealScope,
  isReviewReady,
  requireSelectedOutletAuthority,
} from '@api/modules/ingestion/review-policy'
import { appendAdminAudit } from '@api/modules/platform-admin/audit'
import { legacyVersionWhere, normalizeVersion } from '@api/modules/platform-admin/operation-version'
import { accessTransaction, requireCurrentAdmin } from '@api/modules/platform-admin/transaction'
import {
  authenticatedActor,
  createRestHandler,
  type RestDependencies,
  requireAdmin,
} from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  ingestionReviewRequestSchema,
  ingestionReviewResponseSchema,
} from '@broke-oclock/contracts/ingestion'
import type { RequestHandler } from 'express'
import { z } from 'zod'

const reviewPathSchema = z.object({ dealId: z.string().regex(/^[a-f0-9]{24}$/) }).strict()

export const postIngestionDraftReview = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (request, response, context) => {
    const session = await requireAdmin(context)
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const { dealId } = parseRestInput(reviewPathSchema, request.params)
    const input = parseRestInput(ingestionReviewRequestSchema, request.body)
    const result = await accessTransaction(context.db, async (tx) => {
      const admin = await requireCurrentAdmin(tx, authenticatedActor(session))
      const deal = await tx.deal.findFirst({
        where: { ...importedDealScope, id: dealId },
        include: { sources: { include: { importedPost: true } }, venues: true },
      })
      if (!deal) throw new ApiErrorException('NOT_FOUND', 'NOT_FOUND')
      if (
        deal.reviewStatus !== 'PENDING' ||
        deal.contentVersion !== input.expectedContentVersion ||
        normalizeVersion(deal.operationVersion) !== input.expectedOperationVersion
      )
        throw new ApiErrorException('CONFLICT', 'Draft changed or already reviewed')
      const now = context.ingestion?.now() ?? new Date()
      if (input.decision === 'APPROVE' && !isReviewReady(deal, now))
        throw new ApiErrorException(
          'PRECONDITION_FAILED',
          'Draft needs validity, offer or source clarification',
        )
      if (input.decision === 'APPROVE') await requireSelectedOutletAuthority(tx, deal)
      await fenceDraftEvidence(
        tx,
        deal.sources,
        now,
        input.decision === 'APPROVE' &&
          (deal.applicability === 'SELECTED_OUTLETS' ||
            deal.applicability === 'ALL_MERCHANT_OUTLETS'),
      )
      const reviewStatus =
        input.decision === 'APPROVE' ? ('APPROVED' as const) : ('REJECTED' as const)
      const changed = await tx.deal.updateMany({
        where: {
          ...importedDealScope,
          id: deal.id,
          contentVersion: input.expectedContentVersion,
          AND: [legacyVersionWhere('operationVersion', input.expectedOperationVersion)],
          reviewStatus: 'PENDING',
        },
        data: {
          reviewStatus,
          operationVersion: input.expectedOperationVersion + 1,
          reviewNote: input.note,
          reviewedById: admin.id,
          reviewedAt: now,
          reviewedVersion: input.expectedContentVersion,
          publishedAt: input.decision === 'APPROVE' && hasCurrentSourceScope(deal) ? now : null,
        },
      })
      if (changed.count !== 1)
        throw new ApiErrorException('CONFLICT', 'Draft changed or already reviewed')
      await appendAdminAudit(tx, admin, {
        action: input.decision === 'APPROVE' ? 'DEAL_APPROVED' : 'DEAL_REJECTED',
        subjectType: 'DEAL',
        subjectId: deal.id,
        note: input.note,
        details: {
          operationVersionBefore: input.expectedOperationVersion,
          operationVersionAfter: input.expectedOperationVersion + 1,
          contentVersionBefore: deal.contentVersion,
          contentVersionAfter: deal.contentVersion,
          previousStatus: deal.reviewStatus,
          newStatus: reviewStatus,
          changedFields: ['reviewStatus'],
        },
      })
      return { id: deal.id, reviewStatus, operationVersion: input.expectedOperationVersion + 1 }
    })
    response.json(ingestionReviewResponseSchema.parse(result))
  })
