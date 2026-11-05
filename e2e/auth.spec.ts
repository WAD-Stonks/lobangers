import { expect, type Page, test } from '@playwright/test'
// biome-ignore lint/style/noRestrictedImports: E2E-only fixtures; no E2E alias exists.
import { type Account, account, type Backend, fakeBackend } from './fake-backend'

const PASSWORD = 'synthetic-password-1'
const NEW_PASSWORD = 'synthetic-password-2'
const OTP = '012345'
const RESET_TOKEN = 'synthetic-reset-token'

type Mailbox = { password: string; verified: boolean; user: Account }

const fakeAuth = async (page: Page, existing: Mailbox[] = []) => {
  const backend = await fakeBackend(page)
  const accounts = new Map(existing.map((entry) => [entry.user.email, entry]))
  const refuse = (status: number, code: string) => ({ status, json: { code, message: code } })
  const signIn = (entry: Mailbox) => {
    backend.signIn(entry.user)
    return { json: { redirect: false, token: 'synthetic-token', user: entry.user } }
  }

  backend.on('POST', '/api/auth/sign-up/email', ({ body }) => {
    if (accounts.has(body.email)) return refuse(422, 'USER_ALREADY_EXISTS')
    const user = account('USER', {
      id: 'b7'.repeat(12),
      name: body.name,
      email: body.email,
      emailVerified: false,
    })
    accounts.set(body.email, { password: body.password, verified: false, user })
    return { json: { token: null, user } }
  })
  backend.on('POST', '/api/auth/sign-in/email', ({ body }) => {
    const entry = accounts.get(body.email)
    if (!entry || entry.password !== body.password) return refuse(401, 'INVALID_EMAIL_OR_PASSWORD')
    if (!entry.verified) return refuse(403, 'EMAIL_NOT_VERIFIED')
    return signIn(entry)
  })
  backend.on('POST', '/api/auth/email-otp/send-verification-otp', () => ({
    json: { success: true },
  }))
  backend.on('POST', '/api/auth/sign-in/email-otp', ({ body }) => {
    const entry = accounts.get(body.email)
    return entry && body.otp === OTP ? signIn(entry) : refuse(400, 'INVALID_OTP')
  })
  backend.on('POST', '/api/auth/request-password-reset', () => ({ json: { status: true } }))
  backend.on('POST', '/api/auth/reset-password', ({ body }) => {
    if (body.token !== RESET_TOKEN) return refuse(400, 'INVALID_TOKEN')
    for (const entry of accounts.values()) entry.password = body.newPassword
    return { json: { status: true } }
  })

  const verify = (email: string) => {
    const entry = accounts.get(email)
    if (!entry) throw new Error(`No account for ${email}`)
    entry.verified = true
    entry.user = { ...entry.user, emailVerified: true }
  }
  return { backend, verify }
}

const member = (): Mailbox => ({
  password: PASSWORD,
  verified: true,
  user: account('USER', { name: 'Synthetic Priya', email: 'synthetic-priya@example.test' }),
})

const logIn = async (page: Page, email: string, password: string) => {
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
}

const expectSignedInAs = async (page: Page, name: string) => {
  await expect(page).toHaveURL(/\/browse\?view=list/)
  await expect(page.getByRole('button', { name: `Account menu for ${name}` })).toBeVisible()
}

const lastBody = (backend: Backend, path: string) => backend.callsTo('POST', path).at(-1)?.body

test('a new visitor registers, verifies their email and logs in', async ({ page }) => {
  const { backend, verify } = await fakeAuth(page)

  await page.goto('/sign-up')
  await expect(page.getByRole('heading', { level: 1, name: 'Create an account' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign up', exact: true }).click()
  await expect(page.getByText('Enter your name.')).toBeVisible()
  await expect(page.getByText('Enter a valid email address.')).toBeVisible()
  expect(backend.callsTo('POST', '/api/auth/sign-up/email')).toHaveLength(0)

  await page.getByLabel('Name', { exact: true }).fill('Synthetic Wei Ling')
  await page.getByLabel('Email', { exact: true }).fill('synthetic-weiling@example.test')
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password', { exact: true }).fill('a-different-password')
  await page.getByRole('button', { name: 'Sign up', exact: true }).click()
  await expect(page.getByText('Passwords do not match.')).toBeVisible()
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign up', exact: true }).click()

  await expect(page).toHaveURL(/\/sign-in\?notice=verify/)
  await expect(page.getByRole('status')).toHaveText(
    'Check your email for a link to verify your account, then log in.',
  )
  const signUp = lastBody(backend, '/api/auth/sign-up/email')
  expect(signUp).toMatchObject({
    name: 'Synthetic Wei Ling',
    email: 'synthetic-weiling@example.test',
    password: PASSWORD,
  })

  await logIn(page, 'synthetic-weiling@example.test', PASSWORD)
  await expect(page.getByRole('alert')).toHaveText(
    'Please verify your email first. We have sent you a new link.',
  )

  verify('synthetic-weiling@example.test')
  await page.goto(signUp.callbackURL)
  await expect(page.getByRole('status')).toHaveText('Your email is verified. You can log in now.')
  await logIn(page, 'synthetic-weiling@example.test', PASSWORD)
  await expectSignedInAs(page, 'Synthetic Wei Ling')
})

test('a wrong password is refused, then the right one logs in and the member logs out', async ({
  page,
}) => {
  const priya = member()
  const { backend } = await fakeAuth(page, [priya])

  await page.goto('/sign-in')
  await logIn(page, priya.user.email, 'not-the-password')
  await expect(page.getByRole('alert')).toHaveText(
    'Sign-in failed. Check your credentials and try again.',
  )
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')

  await logIn(page, priya.user.email, PASSWORD)
  await expectSignedInAs(page, 'Synthetic Priya')

  await page.reload()
  await expectSignedInAs(page, 'Synthetic Priya')

  await page.getByRole('button', { name: 'Account menu for Synthetic Priya' }).click()
  await page
    .getByRole('navigation', { name: 'Account' })
    .getByRole('button', { name: 'Log out' })
    .click()
  await expect(page).toHaveURL(/\/$/)
  expect(backend.callsTo('POST', '/api/auth/sign-out')).toHaveLength(1)
  await page.goto('/deals')
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Account menu/ })).toHaveCount(0)
})

test('a member logs in with a code from their email', async ({ page }) => {
  const priya = member()
  const { backend } = await fakeAuth(page, [priya])

  await page.goto('/sign-in')
  await page.getByTestId('use-code').click()
  await page.getByLabel('Email', { exact: true }).fill(priya.user.email)
  await page.getByTestId('otp-send').click()
  await expect(page.getByLabel('Sign-in code', { exact: true })).toBeFocused()
  expect(lastBody(backend, '/api/auth/email-otp/send-verification-otp')).toEqual({
    email: priya.user.email,
    type: 'sign-in',
  })

  await page.getByLabel('Sign-in code', { exact: true }).fill('999999')
  await page.getByRole('button', { name: 'Sign in with code' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Code sign-in could not be completed. Try again or request a new code.',
  )

  await page.getByLabel('Sign-in code', { exact: true }).fill(OTP)
  await page.getByRole('button', { name: 'Sign in with code' }).click()
  await expectSignedInAs(page, 'Synthetic Priya')
})

test('a member who forgot their password resets it from the emailed link and logs in', async ({
  page,
}) => {
  const priya = member()
  const { backend } = await fakeAuth(page, [priya])

  await page.goto('/forgot-password')
  await page.getByLabel('Email', { exact: true }).fill(priya.user.email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('status')).toContainText("we've sent a link to reset the password")
  const request = lastBody(backend, '/api/auth/request-password-reset')
  expect(request).toEqual({
    email: priya.user.email,
    redirectTo: new URL('/reset-password', page.url()).href,
  })

  await page.goto('/reset-password?token=expired-token')
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
  await page.getByLabel('Confirm new password', { exact: true }).fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'invalid or has expired' })).toBeVisible()

  await page.goto(`/reset-password?token=${RESET_TOKEN}`)
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
  await page.getByLabel('Confirm new password', { exact: true }).fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page).toHaveURL(/\/sign-in\?notice=reset/)
  await expect(page.getByRole('status')).toHaveText(
    'Your password was changed. Log in with the new one.',
  )

  await logIn(page, priya.user.email, PASSWORD)
  await expect(page.getByRole('alert')).toHaveText(
    'Sign-in failed. Check your credentials and try again.',
  )
  await logIn(page, priya.user.email, NEW_PASSWORD)
  await expectSignedInAs(page, 'Synthetic Priya')
})
