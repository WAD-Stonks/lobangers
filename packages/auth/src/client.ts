import type { Auth } from '@auth/types'
import { emailOTPClient, inferAdditionalFields } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'

export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [inferAdditionalFields<Auth>(), emailOTPClient()],
})
