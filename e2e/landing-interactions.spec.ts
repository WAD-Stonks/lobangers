import { expect, type Page, test } from '@playwright/test'

test.use({
  viewport: { width: 1440, height: 1000 },
  contextOptions: { reducedMotion: 'no-preference' },
})

const scrollStoryTo = async (page: Page, progress: number) => {
  await page.locator('#story').evaluate((element, value) => {
    const top = element.getBoundingClientRect().top + window.scrollY
    window.scrollTo({
      top: top + (element.clientHeight - window.innerHeight) * value,
      behavior: 'instant',
    })
  }, progress)
}

for (const key of ['Enter', 'Space']) {
  test(`story playback starts and pauses with native ${key} activation`, async ({ page }) => {
    await page.goto('/')
    await scrollStoryTo(page, 0)
    const toggle = page
      .locator('#story')
      .getByRole('button', { name: /Auto-play story|Pause story/ })
    await expect(toggle).toHaveAccessibleName(/Auto-play story/)
    await toggle.focus()
    await page.keyboard.press(key)
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press(key)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    // The same control can restart playback; navigation keys still interrupt it.
    await page.keyboard.press(key)
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Escape')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })
}

test('the WebGL stall disappears on reverse scrolling and after leaving reduced motion', async ({
  page,
}) => {
  await page.goto('/')
  await scrollStoryTo(page, 0.96)
  const renderer = page.locator('.hawker-renderer')
  const canvas = renderer.locator('canvas')
  await expect(renderer).toHaveAttribute('data-renderer', 'three')
  await expect(canvas).toBeVisible()
  await scrollStoryTo(page, 0.4)
  await expect(page.locator('.community-freshness')).toHaveAttribute('aria-hidden', 'true')
  await expect(canvas).toBeHidden()
  await scrollStoryTo(page, 0.96)
  await expect(canvas).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('#story')).toHaveClass(/story-reduced/)
  await expect(canvas).toBeVisible()
  await expect(page.locator('.story-playback-toggle')).toHaveCount(0)
  // Move back while the still scene is displayed, then restore scroll-driven motion.
  await scrollStoryTo(page, 0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator('#story')).not.toHaveClass(/story-reduced/)
  await expect(canvas).toBeHidden()
})
