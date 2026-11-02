import { createAuth } from '@broke-oclock/auth/server'
import { describe, expect, it, vi } from 'vitest'

// Callback-level characterization in addition to the native HTTP/disposable DB regression.
describe('verification preparation safe failure boundary', () => {
  it.each([
    ['CONFLICT', 'CONFLICT'],
    ['BAD_REQUEST', 'BAD_REQUEST'],
    ['UNAUTHORIZED', 'UNAUTHORIZED'],
    ['PRECONDITION_FAILED', 'IDENTITY_ERROR'],
    ['NOT_FOUND', 'IDENTITY_ERROR'],
    ['P1001', 'UNEXPECTED_DATABASE_FAILURE'],
    ['private-code-token', 'UNEXPECTED_DATABASE_FAILURE'],
  ])(
    'logs only the allowlisted classification for %s and keeps fatal public failure',
    async (code, category) => {
      const privateError = Object.assign(new Error('private password token URL email payload'), {
        code,
        payload: 'private',
      })
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const prepare = vi.fn(async () => {
        throw privateError
      })
      const auth = createAuth({
        baseURL: 'http://127.0.0.1:1',
        trustedOrigin: 'http://localhost:5173',
        secret: 'test-only-secret-at-least-thirty-two-characters',
        prepareEmailVerification: prepare,
      })
      const callback = auth.options.emailVerification?.beforeEmailVerification
      if (!callback) throw new Error('Missing native callback')
      const user = {
        id: '0123456789abcdef01234567',
        email: 'private@example.test',
        emailVerified: false,
        name: 'Private',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      try {
        await expect(
          callback(user, new Request('http://127.0.0.1:1/api/auth/verify-email?token=private')),
        ).rejects.toMatchObject({
          statusCode: 500,
          body: { message: 'Email verification could not be completed' },
        })
        expect(warning.mock.calls).toEqual([
          [JSON.stringify({ event: 'admin-email-verification-preparation-failed', category })],
        ])
        expect(prepare).toHaveBeenCalledTimes(1)
      } finally {
        warning.mockRestore()
      }
    },
  )
})
