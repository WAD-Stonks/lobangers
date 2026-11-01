import { shallowRef } from 'vue'

export type AuthChoice = 'login' | 'register' | null
export const authPrompt = shallowRef<{ resolve: (choice: AuthChoice) => void } | null>(null)

export function requestAuth(): Promise<AuthChoice> {
  authPrompt.value?.resolve(null)
  return new Promise((resolve) => {
    authPrompt.value = { resolve: (choice) => { authPrompt.value = null; resolve(choice) } }
  })
}
