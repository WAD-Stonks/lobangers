import { useSquadRoom } from '@web/modules/squad/use-squad-room'
import { computed } from 'vue'

export const useOpenRoomCode = () => {
  const room = useSquadRoom()
  return computed(() => {
    const state = room?.state.value
    if (!state || state.status === 'CLOSED' || state.me?.left || state.me?.kicked) return null
    return state.code
  })
}
