import { methodNotAllowed } from '@api/rest/policy'
import { Router } from 'express'

// Same-origin administrative resources intentionally reject OPTIONS before CORS
// and body parsing. Native SDK and existing unrelated preflights stay unchanged.
export const createAdminOptionsRouter = (): Router => {
  const router = Router()
  const groups = [
    {
      methods: ['GET'],
      paths: [
        '/api/admin/deals',
        '/api/admin/deals/:dealId',
        '/api/admin/audit',
        '/api/admin/moderation/reports',
        '/api/admin/moderation/reports/:targetType/:id',
        '/api/admin/moderation/comments',
        '/api/admin/moderation/comments/:id',
        '/api/ingestion/drafts/:dealId/evidence',
        '/api/ingestion/drafts/:dealId/evidence/:citationId',
        '/api/ingestion/posts',
        '/api/ingestion/posts/:postId',
        '/api/ingestion/recoveries/:recoveryId',
      ],
    },
    {
      methods: ['GET', 'HEAD'],
      paths: ['/api/admin/security-context', '/api/admin/accounts/:userId/security'],
    },
    {
      methods: ['GET', 'HEAD', 'DELETE'],
      paths: ['/api/admin/accounts/:userId/sessions'],
    },
    { methods: ['DELETE'], paths: ['/api/admin/accounts/:userId/sessions/:sessionId'] },
    {
      methods: ['PATCH'],
      paths: ['/api/admin/deals/:dealId/content', '/api/admin/deals/:dealId/scope'],
    },
    {
      methods: ['POST'],
      paths: [
        '/api/admin/deals/:dealId/review',
        '/api/admin/deals/:dealId/scope-evidence',
        '/api/admin/deals/:dealId/unpublish',
        '/api/admin/deals/:dealId/reopen',
        '/api/admin/catalogue/merchants/:id/archive',
        '/api/admin/catalogue/venues/:id/archive',
        '/api/admin/catalogue/venues/:id/evidence',
        '/api/admin/catalogue/venues/:id/evidence/withdraw',
        '/api/admin/moderation/reports/:targetType/:id/resolve',
        '/api/admin/moderation/comments/:id/visibility',
        '/api/admin/accounts/:userId/suspend',
        '/api/admin/accounts/:userId/reinstate',
        '/api/ingestion/posts/:postId/recoveries',
      ],
    },
    {
      methods: ['GET', 'POST'],
      paths: ['/api/admin/catalogue/merchants', '/api/admin/catalogue/venues'],
    },
    {
      methods: ['GET', 'PATCH'],
      paths: ['/api/admin/catalogue/merchants/:id', '/api/admin/catalogue/venues/:id'],
    },
  ]
  for (const { paths, methods } of groups) {
    router.options(
      paths,
      (_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store')
        next()
      },
      methodNotAllowed(...methods),
    )
  }
  return router
}
