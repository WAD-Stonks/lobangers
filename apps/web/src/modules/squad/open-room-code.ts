import { useSquadRoom } from '@web/modules/squad/use-squad-room'
import { computed } from 'vue'

// The code of the Squad room the visitor can go back to, or null when there is none (never
// joined, closed, left or kicked). The header's Room button and the menu both read it.
export const useOpenRoomCode = () => {
  const room = useSquadRoom()
  return computed(() => {
    const state = room?.state.value
    if (!state || state.status === 'CLOSED' || state.me?.left || state.me?.kicked) return null
    return state.code
  })
}
