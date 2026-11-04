import { dealShareDates } from '@broke-oclock/contracts/deal-copy'
import { mount } from '@vue/test-utils'
import ShareDealButton from '@web/modules/browse-map/ShareDealButton.vue'
import {
  dealShareText,
  telegramShareUrl,
  whatsAppShareUrl,
} from '@web/modules/browse-map/share-deal'
import { afterEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const link = `${window.location.origin}/deals/d1?at=v1`
const share = {
  title: '1-for-1 kopi',
  venueName: 'Synthetic Kopi (Compass One)',
  dates: 'Available from 1 Nov 2026 to 31 Dec 2026',
  url: link,
}
const message = [
  '🍗 1-for-1 kopi!',
  '🏪 Synthetic Kopi — Compass One\n📅 Available from 1 Nov 2026 to 31 Dec 2026',
  "🔥 Don't miss out on this lobang!",
  `🔗 Check out the deal:\n${link}`,
  '🦞 Found on Lobangers — Your next good lobang awaits!',
].join('\n\n')

const router = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/deals/:dealId', name: 'deal', component: { template: '<div />' } }],
  })

const mountButton = (imageUrl?: string) =>
  mount(ShareDealButton, {
    props: {
      dealId: 'd1',
      venueId: 'v1',
      title: share.title,
      venueName: share.venueName,
      dates: share.dates,
      imageUrl,
    },
    global: { plugins: [router()] },
    attachTo: document.body,
  })

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

it('words a share as title, outlet, dates, link and sign-off', () => {
  expect(dealShareText(share)).toBe(message)
  const undated = dealShareText({ ...share, venueName: 'Synthetic Kopi', dates: null })
  expect(undated).toContain('🏪 Synthetic Kopi\n\n🔥')
  expect(undated).not.toContain('📅')
  expect(new URL(whatsAppShareUrl(share)).searchParams.get('text')).toBe(message)
  const telegram = new URL(telegramShareUrl(share))
  expect(telegram.origin + telegram.pathname).toBe('https://t.me/share/url')
  expect(telegram.searchParams.get('url')).toBe(message)
  expect(telegram.searchParams.has('text')).toBe(false)
})

it('gives the date range, else the last day, else the start, from an exclusive end', () => {
  // 1 Nov to 31 Dec 2026 in Singapore: the stored end is the instant after the last day.
  const from = '2026-10-31T16:00:00.000Z'
  const until = '2026-12-31T16:00:00.000Z'
  expect(dealShareDates(from, until)).toBe('Available from 1 Nov 2026 to 31 Dec 2026')
  expect(dealShareDates('2026-12-20T16:00:00.000Z', '2027-01-04T16:00:00.000Z')).toBe(
    'Available from 21 Dec 2026 to 4 Jan 2027',
  )
  expect(dealShareDates(undefined, until)).toBe('Available until 31 Dec 2026')
  expect(dealShareDates('2026-10-13T16:00:00.000Z', null)).toBe('Available from 14 Oct 2026')
  expect(dealShareDates(undefined, null)).toBeNull()
})

it('opens a menu first, and More… opens the share sheet with the picture', async () => {
  const shareSheet = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { ...navigator, share: shareSheet, canShare: () => true })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['x'], { type: 'image/jpeg' }),
    }),
  )
  const wrapper = mountButton('https://media.example.test/kopi.jpg')
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
  await new Promise((resolve) => setTimeout(resolve))

  await wrapper.get('[data-testid="share-deal"]').trigger('click')
  expect(shareSheet).not.toHaveBeenCalled()
  const items = [...document.querySelectorAll('[role="menuitem"]')].map((item) =>
    item.textContent?.trim(),
  )
  expect(items).toEqual(['Copy link', 'WhatsApp', 'Telegram', 'More…'])
  document.querySelector<HTMLButtonElement>('[data-testid="share-more"]')?.click()
  await vi.waitFor(() => expect(shareSheet).toHaveBeenCalled())
  const sent = shareSheet.mock.calls[0]?.[0]
  expect(sent.files[0].name).toBe('deal.jpg')
  expect(sent.text).toBe(message)
  expect(sent.url).toBeUndefined()
  await wrapper.vm.$nextTick()
  expect(document.querySelector('[data-testid="share-menu"]')).toBeNull()
  wrapper.unmount()
})

it('is an icon button whose accessible name says Share', () => {
  const wrapper = mountButton()
  const button = wrapper.get('[data-testid="share-deal"]')
  expect(button.text()).toBe('')
  expect(button.attributes('aria-label')).toBe('Share')
  wrapper.unmount()
})

it('leaves out More… where the browser has no share sheet, and copies the link', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })
  const wrapper = mountButton()
  const button = wrapper.get('[data-testid="share-deal"]')

  await button.trigger('click')
  await vi.waitFor(() =>
    expect(document.querySelector('[data-testid="share-menu"]')).not.toBeNull(),
  )
  expect(button.attributes('aria-expanded')).toBe('true')
  const items = [...document.querySelectorAll('[role="menuitem"]')].map((item) =>
    item.textContent?.trim(),
  )
  expect(items).toEqual(['Copy link', 'WhatsApp', 'Telegram'])

  document.querySelector<HTMLButtonElement>('[data-testid="share-copy"]')?.click()
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(link))
  await wrapper.vm.$nextTick()
  expect(document.querySelector('[data-testid="share-menu"]')).toBeNull()
  wrapper.unmount()
})
