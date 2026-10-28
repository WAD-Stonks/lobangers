import { safeAuthDestination } from '@web/lib/admin-session'
import { expect, it } from 'vitest'

const origin = 'https://lobangers.example.test'
it.each(['/admin/deals', '/admin/catalogue', '/admin/moderation', '/admin/audit'])(
  'returns to the exact admin destination %s after native sign-in',
  (destination) => {
    expect(safeAuthDestination(destination, origin)).toBe(`${origin}${destination}`)
  },
)
it.each([
  'https://evil.example/admin/audit',
  '//evil.example/admin/deals',
  '/admin/audit?callbackURL=https://evil.example',
  '/admin/deals#approve',
  '/admin/accounts/../audit',
  '/admin/audit/',
])('refuses non-exact return destination %s', (destination) => {
  expect(safeAuthDestination(destination, origin)).toBe(`${origin}/`)
})
