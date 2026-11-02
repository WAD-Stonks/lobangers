import { expect, test } from '@playwright/test'

// Original SPA and native SDK over explicitly synthetic HTTP responses.
// This verifies UI/transport behavior, not mailbox ownership or provider authentication.
test.use({ trace: 'off', video: 'off' })

for (const width of [390, 1280]) {
  test(`shared account login and recovery retain their hierarchy and password continuation at ${width}px`, async ({
    page,
  }, info) => {
    const requests: string[] = []
    const unexpected: string[] = []
    const errors: string[] = []
    let social: unknown
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    await page.route('**/api/**', async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      requests.push(`${request.method()} ${path}`)
      let body: unknown
      if (path === '/api/auth/get-session' && request.method() === 'GET') body = null
      else if (path === '/api/auth-methods' && request.method() === 'GET')
        body = { password: true, google: true, emailOtp: true, passwordRecovery: true }
      else if (path === '/api/auth/sign-in/social' && request.method() === 'POST') {
        social = request.postDataJSON()
        body = { redirect: false, url: 'https://controlled-provider.invalid/' }
      } else if (
        request.method() === 'POST' &&
        [
          '/api/auth/email-otp/send-verification-otp',
          '/api/auth/email-otp/request-password-reset',
          '/api/auth/email-otp/reset-password',
        ].includes(path)
      )
        body = { success: true }
      else {
        unexpected.push(`${request.method()} ${path}`)
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
        return
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
    })

    await page.goto('/sign-in?redirect=/saved')
    await expect(page.getByTestId('standalone-auth')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.locator('.auth-card')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Create an account', exact: true })).toHaveCount(1)
    await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
    await expect(page.getByTestId('otp-send')).toBeEnabled()
    await page.getByTestId('google-sign-in').click()
    await expect(page.getByTestId('google-sign-in')).toBeEnabled()
    const destination = new URL('/deals', page.url()).href
    expect(social).toMatchObject({
      provider: 'google',
      callbackURL: destination,
      newUserCallbackURL: destination,
      errorCallbackURL: new URL('/login?redirect=%2Fdeals', page.url()).href,
    })

    await page.getByLabel('Email', { exact: true }).fill('person@example.test')
    await page.getByTestId('otp-send').click()
    await expect(page.getByLabel('Sign-in code', { exact: true })).toBeVisible()
    await page.getByTestId('use-password').click()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    await page.getByTestId('recovery-open').click()
    await page.getByLabel('Email', { exact: true }).fill('person@example.test')
    await page.getByRole('button', { name: 'Send recovery code', exact: true }).click()
    await expect(page.getByTestId('recovery-reset')).toBeVisible()
    await page.getByLabel('Recovery code', { exact: true }).fill('012345')
    await page.getByLabel('New password', { exact: true }).fill('synthetic-new-password')
    await page.getByRole('button', { name: 'Reset password', exact: true }).click()
    await expect(
      page.getByText('Password reset. Sign in again with your new password.', { exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
    await expect(page.getByTestId('use-password')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    expect(requests.filter((request) => request.startsWith('POST '))).toEqual([
      'POST /api/auth/sign-in/social',
      'POST /api/auth/email-otp/send-verification-otp',
      'POST /api/auth/email-otp/request-password-reset',
      'POST /api/auth/email-otp/reset-password',
    ])
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
    await page.screenshot({
      path: info.outputPath(`shared-login-recovered-${width}.png`),
      fullPage: true,
    })
  })
}
