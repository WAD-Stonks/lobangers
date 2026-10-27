import type { IngestionDraft } from '@broke-oclock/contracts/ingestion'
import { flushPromises, mount } from '@vue/test-utils'
import DealImage from '@web/components/DealImage.vue'
import { api } from '@web/lib/api-client'
import DraftImages from '@web/modules/ingestion-admin/DraftImages.vue'
import DraftQueue from '@web/modules/ingestion-admin/DraftQueue.vue'
import { expect, it } from 'vitest'

// Synthetic HTTP boundary; real SDK schemas and original mounted Vue components.
const image = {
  sha256: 'a'.repeat(64),
  url: 'https://media.example.test/promo.jpg',
  sourceUrl: 'https://source.example.test/original.jpg',
  altText: 'Synthetic lunch offer poster',
  mimeType: 'image/jpeg',
  sizeBytes: 1234,
  status: 'HOSTED',
}
const draft: IngestionDraft = {
  id: '111111111111111111111111',
  title: 'Synthetic lunch offer',
  description: 'Imported offer',
  terms: null,
  category: 'FOOD',
  offerType: 'OTHER',
  validFrom: null,
  validUntil: null,
  rawValidityText: null,
  applicability: 'NO_FIXED_LOCATION',
  merchantId: null,
  outlet: null,
  reviewStatus: 'PENDING',
  contentVersion: 7,
  sourceUrl: 'https://source.example.test/post',
  sourceName: 'Synthetic source',
  reviewNote: null,
  reviewReady: false,
  images: [image],
}

it('shows a hosted imported draft image only in selected review evidence with original provenance', async (ctx) => {
  const previous = api.http.defaults.adapter
  api.http.defaults.adapter = async (config) => ({
    data: { items: [draft], nextCursor: null },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  })
  const wrapper = mount(DraftQueue, { props: { revision: 0 } })
  ctx.onTestFinished(() => {
    wrapper.unmount()
    api.http.defaults.adapter = previous
  })
  await flushPromises()
  expect(wrapper.find('img').exists()).toBe(false)
  await wrapper.get(`[data-testid="view-${draft.id}"]`).trigger('click')
  const photo = wrapper.get('img')
  expect(photo.attributes('src')).toBe(image.url)
  expect(photo.attributes('alt')).toBe(image.altText)
  expect(photo.attributes('loading')).toBe('lazy')
  expect(photo.attributes('referrerpolicy')).toBe('no-referrer')
  const source = wrapper.get('[data-testid="image-source"]')
  expect(source.attributes('href')).toBe(image.sourceUrl)
  expect(source.attributes('rel')).toContain('noreferrer')
  expect(wrapper.text()).toContain(image.sha256)
  expect(wrapper.text()).toContain('HOSTED')
  expect(wrapper.get('[data-testid="approve-draft"]').attributes('disabled')).toBeDefined()
})

// Archive-read compatibility characterization; downloader limits are a separate policy.
it('accepts hosted GIF metadata above 4 MiB through the actual draft SDK and queue', async (ctx) => {
  const gif = {
    ...image,
    url: 'https://media.example.test/archive.gif',
    mimeType: 'image/gif',
    sizeBytes: 5_939_727,
  }
  const previous = api.http.defaults.adapter
  api.http.defaults.adapter = async (config) => ({
    data: { items: [{ ...draft, images: [gif] }], nextCursor: null },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  })
  const wrapper = mount(DraftQueue, { props: { revision: 0 } })
  ctx.onTestFinished(() => {
    wrapper.unmount()
    api.http.defaults.adapter = previous
  })
  await flushPromises()
  await wrapper.get(`[data-testid="view-${draft.id}"]`).trigger('click')
  expect(wrapper.get('img').attributes('src')).toBe(gif.url)
  expect(wrapper.get('img').attributes('alt')).toBe(gif.altText)
  expect(wrapper.text()).not.toContain('Unable to load drafts')
})

it.each([
  'javascript:alert(1)',
  'data:image/svg+xml,<svg/>',
  '//example.test/x',
  'http://example.test/x',
  'https://user:secret@example.test/x',
  'not a URL',
])('never requests an unsafe image URL: %s', (url) => {
  const w = mount(DealImage, { props: { url, alt: 'Synthetic poster' } })
  expect(w.find('img').exists()).toBe(false)
  expect(w.text()).toContain('No photo')
  w.unmount()
})

it('replaces a broken hosted image with explicit failure and recovers on a new URL', async () => {
  const w = mount(DealImage, { props: { url: image.url, alt: 'Synthetic poster' } })
  await w.get('img').trigger('error')
  expect(w.find('img').exists()).toBe(false)
  expect(w.text()).toContain('Image unavailable')
  await w.setProps({ url: 'https://media.example.test/replacement.jpg' })
  expect(w.get('img').attributes('src')).toContain('replacement.jpg')
  w.unmount()
})

it('ignores a late error from a replaced image node without hiding its replacement', async () => {
  const w = mount(DealImage, { props: { url: image.url, alt: 'Synthetic poster' } })
  try {
    const oldImage = w.get('img').element
    const replacement = 'https://media.example.test/replacement.jpg'
    await w.setProps({ url: replacement })
    oldImage.dispatchEvent(new Event('error'))
    await flushPromises()
    expect(w.get('img').attributes('src')).toBe(replacement)
    await w.get('img').trigger('error')
    expect(w.text()).toContain('Image unavailable')
    await w.setProps({ url: null })
    expect(w.text()).toContain('No photo')
  } finally {
    w.unmount()
  }
})

it('blocks unsafe provenance links and non-image metadata without hiding evidence', () => {
  const w = mount(DraftImages, {
    props: {
      title: draft.title,
      images: [{ ...image, mimeType: 'text/html', sourceUrl: 'javascript:alert(1)' }],
    },
  })
  expect(w.find('img').exists()).toBe(false)
  expect(w.find('a').exists()).toBe(false)
  expect(w.text()).toContain('Source link unavailable')
  expect(w.text()).toContain(image.sha256)
  w.unmount()
})

// Characterization of the existing status gate, not feature RED.
it.each(['DOWNLOADED_ONLY', 'UNKNOWN', 'FAILED', 'future-state'])(
  'never falls back to source URLs for %s media',
  (status) => {
    const w = mount(DraftImages, { props: { title: draft.title, images: [{ ...image, status }] } })
    expect(w.find('img').exists()).toBe(false)
    expect(w.text()).toContain(status)
    w.unmount()
  },
)

it('keeps empty image evidence explicit', () => {
  const w = mount(DraftImages, { props: { title: draft.title, images: [] } })
  expect(w.text()).toContain('No imported images supplied')
  w.unmount()
})
