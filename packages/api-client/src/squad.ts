import { request, validateInput } from '@api-client/transport'
import {
  type SquadChoiceInput,
  type SquadCreate,
  type SquadJoin,
  type SquadRealtimeAuth,
  type SquadVoteInput,
  squadAddDealsSchema,
  squadChoiceSchema,
  squadCodeParamsSchema,
  squadCreateSchema,
  squadJoinSchema,
  squadPeekSchema,
  squadRealtimeAuthResponseSchema,
  squadRealtimeAuthSchema,
  squadRealtimeConfigSchema,
  squadStateSchema,
  squadSyncResponseSchema,
  squadVoteSchema,
} from '@broke-oclock/contracts/squad'
import type { AxiosInstance } from 'axios'

const room = (code: string) => `/squad/rooms/${validateInput(squadCodeParamsSchema, { code }).code}`

// Makan Squad rooms: hosting, joining, the lobby controls, voting, the sync heartbeat and the
// live channel handshake.
export const createSquadClient = (http: AxiosInstance) => ({
  realtimeConfig: () => request(http.get('/squad/realtime'), squadRealtimeConfigSchema),
  realtimeAuth: (input: SquadRealtimeAuth) =>
    request(
      http.post('/squad/realtime/auth', validateInput(squadRealtimeAuthSchema, input)),
      squadRealtimeAuthResponseSchema,
    ),
  create: (input: SquadCreate) =>
    request(http.post('/squad/rooms', validateInput(squadCreateSchema, input)), squadStateSchema),
  peek: (code: string) => request(http.get(room(code)), squadPeekSchema),
  join: (code: string, input: SquadJoin) =>
    request(
      http.post(`${room(code)}/join`, validateInput(squadJoinSchema, input)),
      squadStateSchema,
    ),
  sync: (code: string, after: number) =>
    request(http.post(`${room(code)}/sync`, { after }), squadSyncResponseSchema),
  start: (code: string) => request(http.post(`${room(code)}/start`), squadStateSchema),
  leave: (code: string) => request(http.post(`${room(code)}/leave`), squadStateSchema),
  close: (code: string) => request(http.post(`${room(code)}/close`), squadStateSchema),
  remove: (code: string, memberId: string) =>
    request(http.post(`${room(code)}/members/${memberId}/remove`), squadStateSchema),
  addDeals: (code: string, dealIds: string[]) =>
    request(
      http.post(`${room(code)}/deals`, validateInput(squadAddDealsSchema, { dealIds })),
      squadStateSchema,
    ),
  vote: (code: string, input: SquadVoteInput) =>
    request(
      http.post(`${room(code)}/votes`, validateInput(squadVoteSchema, input)),
      squadStateSchema,
    ),
  choose: (code: string, input: SquadChoiceInput) =>
    request(
      http.post(`${room(code)}/choices`, validateInput(squadChoiceSchema, input)),
      squadStateSchema,
    ),
})
