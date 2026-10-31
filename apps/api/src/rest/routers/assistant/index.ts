import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { chatWithAssistant } from '@api/rest/routers/assistant/handlers/chat'
import { Router } from 'express'

export const createAssistantRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.post('/chat', chatWithAssistant(dependencies))
  router.all('/chat', methodNotAllowed('POST'))
  return router
}
