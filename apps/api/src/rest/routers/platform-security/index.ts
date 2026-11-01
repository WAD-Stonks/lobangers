import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { reinstateAccountHandler } from '@api/rest/routers/platform-security/reinstate'
import { revokeAccountSessionHandler } from '@api/rest/routers/platform-security/revoke-session'
import { revokeAccountSessionsHandler } from '@api/rest/routers/platform-security/revoke-sessions'
import { getAccountSecurity } from '@api/rest/routers/platform-security/security'
import { getSecurityContext } from '@api/rest/routers/platform-security/security-context'
import { listAccountSessions } from '@api/rest/routers/platform-security/sessions'
import { suspendAccountHandler } from '@api/rest/routers/platform-security/suspend'
import { Router } from 'express'

export const createPlatformSecurityRouter = (dependencies: RestDependencies) => {
  const router = Router()
  router.all(
    [
      '/admin/security-context',
      '/admin/accounts/:userId/security',
      '/admin/accounts/:userId/sessions',
      '/admin/accounts/:userId/sessions/:sessionId',
      '/admin/accounts/:userId/suspend',
      '/admin/accounts/:userId/reinstate',
    ],
    (_request, response, next) => {
      response.setHeader('Cache-Control', 'no-store')
      next()
    },
  )
  router.get('/admin/security-context', getSecurityContext(dependencies))
  router.get('/admin/accounts/:userId/security', getAccountSecurity(dependencies))
  router.get('/admin/accounts/:userId/sessions', listAccountSessions(dependencies))
  router.post('/admin/accounts/:userId/suspend', suspendAccountHandler(dependencies))
  router.post('/admin/accounts/:userId/reinstate', reinstateAccountHandler(dependencies))
  router.delete(
    '/admin/accounts/:userId/sessions/:sessionId',
    revokeAccountSessionHandler(dependencies),
  )
  router.delete('/admin/accounts/:userId/sessions', revokeAccountSessionsHandler(dependencies))
  router.all('/admin/accounts/:userId/suspend', methodNotAllowed('POST'))
  router.all('/admin/accounts/:userId/reinstate', methodNotAllowed('POST'))
  router.all('/admin/accounts/:userId/sessions/:sessionId', methodNotAllowed('DELETE'))
  router.all('/admin/security-context', methodNotAllowed('GET', 'HEAD'))
  router.all('/admin/accounts/:userId/security', methodNotAllowed('GET', 'HEAD'))
  router.all('/admin/accounts/:userId/sessions', methodNotAllowed('GET', 'HEAD', 'DELETE'))
  return router
}
