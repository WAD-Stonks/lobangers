import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { addDealsHandler } from '@api/rest/routers/squad/handlers/add-deals'
import { chooseHandler } from '@api/rest/routers/squad/handlers/choose'
import { closeRoomHandler } from '@api/rest/routers/squad/handlers/close-room'
import { createRoomHandler } from '@api/rest/routers/squad/handlers/create-room'
import { joinRoomHandler } from '@api/rest/routers/squad/handlers/join-room'
import { leaveRoomHandler } from '@api/rest/routers/squad/handlers/leave-room'
import { peekRoomHandler } from '@api/rest/routers/squad/handlers/peek-room'
import {
  realtimeAuthHandler,
  realtimeConfigHandler,
} from '@api/rest/routers/squad/handlers/realtime'
import { removeMemberHandler } from '@api/rest/routers/squad/handlers/remove-member'
import { startRoomHandler } from '@api/rest/routers/squad/handlers/start-room'
import { syncHandler } from '@api/rest/routers/squad/handlers/sync'
import { voteHandler } from '@api/rest/routers/squad/handlers/vote'
import { Router } from 'express'

// Makan Squad rooms: create, join, the lobby controls, voting, the sync heartbeat, and the
// live channel handshake.
export const createSquadRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.get('/squad/realtime', realtimeConfigHandler(dependencies))
  router.post('/squad/realtime/auth', realtimeAuthHandler(dependencies))
  router.post('/squad/rooms', createRoomHandler(dependencies))
  router.get('/squad/rooms/:code', peekRoomHandler(dependencies))
  router.post('/squad/rooms/:code/join', joinRoomHandler(dependencies))
  router.post('/squad/rooms/:code/sync', syncHandler(dependencies))
  router.post('/squad/rooms/:code/start', startRoomHandler(dependencies))
  router.post('/squad/rooms/:code/leave', leaveRoomHandler(dependencies))
  router.post('/squad/rooms/:code/close', closeRoomHandler(dependencies))
  router.post('/squad/rooms/:code/members/:memberId/remove', removeMemberHandler(dependencies))
  router.post('/squad/rooms/:code/deals', addDealsHandler(dependencies))
  router.post('/squad/rooms/:code/votes', voteHandler(dependencies))
  router.post('/squad/rooms/:code/choices', chooseHandler(dependencies))
  router.all('/squad/realtime', methodNotAllowed('GET'))
  router.all('/squad/realtime/auth', methodNotAllowed('POST'))
  router.all('/squad/rooms', methodNotAllowed('POST'))
  router.all('/squad/rooms/:code', methodNotAllowed('GET'))
  router.all('/squad/rooms/:code/join', methodNotAllowed('POST'))
  router.all('/squad/rooms/:code/sync', methodNotAllowed('POST'))
  router.all('/squad/rooms/:code/start', methodNotAllowed('POST'))
  router.all('/squad/rooms/:code/leave', methodNotAllowed('POST'))
  router.all('/squad/rooms/:code/close', methodNotAllowed('POST'))
  router.all('/squad/rooms/:code/members/:memberId/remove', methodNotAllowed('POST'))
  router.all('/squad/rooms/:code/deals', methodNotAllowed('POST'))
  router.all('/squad/rooms/:code/votes', methodNotAllowed('POST'))
  router.all('/squad/rooms/:code/choices', methodNotAllowed('POST'))
  return router
}
