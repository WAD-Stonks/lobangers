import { request, validateInput } from '@api-client/transport'
import {
  myPresenceResponseSchema,
  nearbyPeopleResponseSchema,
  type PresenceAvatar,
  presenceBodySchema,
  presenceHiddenSchema,
  presenceQuerySchema,
} from '@broke-oclock/contracts/presence'
import type { AxiosInstance } from 'axios'

type Point = { readonly lat: number; readonly lng: number }

// Hungry Nearby: who is shown around a point, showing yourself (and heartbeats), and hiding.
export const createPresenceClient = (http: AxiosInstance) => ({
  nearby: (centre: Point) =>
    request(
      http.get('/presence', { params: validateInput(presenceQuerySchema, centre) }),
      nearbyPeopleResponseSchema,
    ),
  share: (point: Point, avatar?: PresenceAvatar) =>
    request(
      http.put(
        '/presence',
        validateInput(presenceBodySchema, avatar ? { ...point, avatar } : { ...point }),
      ),
      myPresenceResponseSchema,
    ),
  hide: () => request(http.delete('/presence'), presenceHiddenSchema),
})
