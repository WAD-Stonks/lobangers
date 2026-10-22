import { expect, test } from '@playwright/test'

// Synthetic browser fixtures exercise the real SPA/client. Real cookie/Prisma persistence
// and concurrency are separately covered by integration/community.test.ts.
const id = 'c'.repeat(24)
const userId = 'a'.repeat(24)
const venue = { id: 'b'.repeat(24), name: 'Synthetic community outlet', lat: 1.3, lng: 103.8 }
for (const width of [320, 390, 1280]) {
  test(`vote, comment, delete and report at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 })
    let vote: string | null = null
    let comments: {
      id: string
      body: string
      authorName: string
      createdAt: string
      canDelete: boolean
    }[] = Array.from({ length: 12 }, (_, index) => ({
      id: (index + 100).toString(16).padStart(24, '0'),
      body:
        index === 0
          ? Array.from({ length: 12 }, (_, line) => `Synthetic outlet tip ${line + 1}.`).join('\n')
          : `Synthetic comment ${index + 1}`,
      authorName: 'Synthetic contributor',
      createdAt: new Date().toISOString(),
      canDelete: false,
    }))
    const reports: unknown[] = []
    const now = new Date().toISOString()
    const user = {
      id: userId,
      name: 'Synthetic community user',
      email: 'synthetic@example.test',
      emailVerified: true,
      role: 'USER',
      createdAt: now,
      updatedAt: now,
    }
    const summary = () => ({
      alive: vote === 'ALIVE' ? 3 : 2,
      dead: vote === 'DEAD' ? 1 : 0,
      status: vote === 'ALIVE' ? 'LIKELY_STILL_ON' : 'UNCERTAIN',
      myVote: vote,
      myVoteIsRecent: vote !== null,
      lastReportedAt: now,
      asOf: now,
      commentCount: comments.length,
      policy: { minAlive: 3, positivePercent: 80, windowHours: 24 },
    })
    await page.route(/basemaps\.cartocdn\.com|onemap\.gov\.sg/, (route) => route.abort())
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      const method = route.request().method()
      if (path.startsWith('/api/auth/get-session'))
        return route.fulfill({
          json: {
            user,
            session: {
              id: 'synthetic-session',
              userId,
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
              createdAt: now,
              updatedAt: now,
            },
          },
        })
      if (path === '/api/me')
        return route.fulfill({
          json: { user, session: { expiresAt: new Date(Date.now() + 86400000).toISOString() } },
        })
      if (path === '/api/account/bookmarks')
        return route.fulfill({ json: { items: [], nextCursor: null } })
      if (path === '/api/deals')
        return route.fulfill({
          json: {
            items: [
              {
                id,
                title: 'Synthetic student meal',
                category: 'FOOD',
                cuisine: 'Western',
                label: '$5',
                description: 'Synthetic community journey',
                offerType: 'FIXED_PRICE',
                priceMinor: 500,
                discountPercent: null,
                terms: null,
                validUntil: null,
                rawValidityText: null,
                votes: { alive: summary().alive, dead: summary().dead, status: summary().status },
                commentCount: comments.length,
                images: [],
                venues: [venue],
              },
            ],
            categories: ['FOOD'],
          },
        })
      if (path.endsWith('/community')) return route.fulfill({ json: summary() })
      if (path.endsWith('/vote')) {
        vote = method === 'DELETE' ? null : route.request().postDataJSON().value
        return route.fulfill({ json: summary() })
      }
      if (path.endsWith('/reports')) {
        reports.push(route.request().postDataJSON())
        return route.fulfill({ json: { ok: true } })
      }
      if (path === `/api/deals/${id}/comments`) {
        if (method === 'POST') {
          const comment = {
            id: 'd'.repeat(24),
            body: route.request().postDataJSON().body,
            authorName: user.name,
            createdAt: now,
            canDelete: true,
          }
          comments = [comment, ...comments]
          return route.fulfill({ status: 201, json: comment })
        }
        const query = new URL(route.request().url()).searchParams
        const cursor = query.get('cursor')
        const start = cursor ? comments.findIndex((comment) => comment.id === cursor) + 1 : 0
        const limit = Number(query.get('limit') ?? 20)
        const items = comments.slice(start, start + limit)
        return route.fulfill({
          json: { items, nextCursor: start + limit < comments.length ? items.at(-1)?.id : null },
        })
      }
      if (path.startsWith('/api/comments/') && method === 'DELETE') {
        comments = comments.filter((comment) => comment.id !== path.split('/').at(-1))
        return route.fulfill({ json: { ok: true } })
      }
      return route.fulfill({
        status: 404,
        json: { error: { code: 'NOT_FOUND', message: 'Synthetic unsupported endpoint' } },
      })
    })
    await page.goto(`/deals/${id}`)
    if (width < 992) {
      await page.getByTestId('sheet-handle').focus()
      await page.getByTestId('sheet-handle').press('ArrowUp')
    }
    const community = page.getByTestId('deal-community')
    await expect(community.locator('.deal-community-comments > li')).toHaveCount(3)
    const firstComment = community.locator('.deal-community-comments > li').first()
    const body = firstComment.locator('.deal-community-body')
    await expect(firstComment.getByRole('button', { name: 'Read more', exact: true })).toBeVisible()
    const collapsedHeight = await body.evaluate((element) => element.clientHeight)
    await firstComment.getByRole('button', { name: 'Read more', exact: true }).click()
    expect(await body.evaluate((element) => element.clientHeight)).toBeGreaterThan(collapsedHeight)
    await firstComment.getByRole('button', { name: 'Show less', exact: true }).click()
    await community.getByLabel('Share your experience').fill('Synthetic draft to keep')
    await community.getByRole('button', { name: 'View all comments (12)', exact: true }).click()
    await expect(community.locator('.deal-community-comments > li')).toHaveCount(5)
    await expect(community.getByLabel('Share your experience')).toHaveValue(
      'Synthetic draft to keep',
    )
    await page.screenshot({ path: info.outputPath(`all-comments-${width}.png`) })
    await expect(page.getByRole('link', { name: 'Get directions', exact: true })).toHaveCount(0)
    await expect(community.getByRole('heading', { name: 'Comments 12', exact: true })).toBeFocused()
    await community.getByRole('button', { name: 'Load 5 more comments', exact: true }).click()
    await expect(community.locator('.deal-community-comments > li')).toHaveCount(10)
    await community.getByRole('button', { name: 'Load 5 more comments', exact: true }).click()
    await expect(community.locator('.deal-community-comments > li')).toHaveCount(12)
    await expect(
      community.getByRole('button', { name: 'Load 5 more comments', exact: true }),
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Back to deal', exact: true }).click()
    await expect(community.locator('.deal-community-comments > li')).toHaveCount(3)
    await expect(community.getByLabel('Share your experience')).toHaveValue(
      'Synthetic draft to keep',
    )
    await expect(
      community.getByRole('button', { name: 'View all comments (12)', exact: true }),
    ).toBeFocused()
    await expect(page.getByRole('link', { name: 'Get directions', exact: true })).toBeVisible()
    await expect(community.getByTestId('vote-alive')).toBeEnabled()
    await community.getByTestId('vote-alive').click()
    await expect(community.locator('.deal-community-status')).toHaveText('Likely still on')
    await community.locator('.deal-community-verification').scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath(`verification-${width}.png`) })
    await community
      .getByLabel('Share your experience')
      .fill('The synthetic outlet honoured this deal.')
    await community.getByRole('button', { name: 'Post comment', exact: true }).click()
    await expect(community.locator('.deal-community-body').first()).toHaveText(
      'The synthetic outlet honoured this deal.',
    )
    await page.screenshot({ path: info.outputPath(`comments-${width}.png`) })
    const touchTargets = await community
      .locator('button:visible')
      .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height))
    expect(touchTargets.every((height) => height >= 44)).toBe(true)
    await community.getByRole('button', { name: 'Delete comment', exact: true }).click()
    await community.getByRole('button', { name: 'Confirm delete', exact: true }).click()
    await expect(community.locator('.deal-community-comments > li')).toHaveCount(3)
    await expect(
      community.getByText('The synthetic outlet honoured this deal.', { exact: true }),
    ).toHaveCount(0)
    await community.getByRole('button', { name: 'Report this deal', exact: true }).click()
    await expect(community.getByLabel('Reason', { exact: true })).toBeFocused()
    await community.getByLabel('Reason', { exact: true }).press('Escape')
    await expect(
      community.getByRole('button', { name: 'Report this deal', exact: true }),
    ).toBeFocused()
    await community.getByRole('button', { name: 'Report this deal', exact: true }).click()
    await community.getByLabel('Reason', { exact: true }).selectOption('MISLEADING')
    await community.getByRole('button', { name: 'Send report', exact: true }).click()
    await expect.poll(() => reports.length).toBe(1)
    await expect(community.getByText('Report received for review.', { exact: false })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })
}
