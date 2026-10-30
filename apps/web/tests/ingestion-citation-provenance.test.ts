import type { CitationDetail as CitationDetailDto } from '@broke-oclock/contracts/ingestion-evidence'
import { mount } from '@vue/test-utils'
import CitationDetail from '@web/modules/ingestion-admin/CitationDetail.vue'
import { expect, it } from 'vitest'

const detail = (finalUrl: string | null): CitationDetailDto => ({
  citation: {
    id: '0123456789abcdef01234567',
    dealId: '0123456789abcdef01234568',
    postId: '0123456789abcdef01234569',
    sourceUrl: 'https://www.moneydigest.sg/synthetic/',
    pinnedHash: 'a'.repeat(64),
    currentHash: 'b'.repeat(64),
    latestSnapshotHash: 'c'.repeat(64),
    hashMatchesCurrent: false,
    postStatus: 'FAILED',
    errorCode: 'SOURCE_CHANGED',
    createdAt: '2026-10-28T00:00:00.000Z',
    fetchedAt: '2026-10-28T00:00:00.000Z',
    imageCount: 1,
    source: {
      id: '0123456789abcdef01234570',
      name: 'Synthetic source',
      provider: 'WORDPRESS',
      externalId: 'moneydigest.sg',
      url: 'https://www.moneydigest.sg/',
      enabled: false,
    },
  },
  snapshot: '{"title":"<script>unsafe()</script>"}',
  snapshotBytes: 40,
  format: 'moneydigest-v1',
  availability: 'COMPLETE',
  hashVerified: true,
  parsed: null,
  parseError: null,
  images: [
    {
      id: '0123456789abcdef01234571',
      sha256: 'd'.repeat(64),
      sourceUrl: 'https://www.moneydigest.sg/wp-content/uploads/original.png',
      finalUrl,
      altText: '<img src=x onerror=unsafe()>',
      url: 'javascript:unsafe()',
      status: 'HOSTED',
      mimeType: 'image/png',
      sizeBytes: 32,
    },
  ],
  nextImageCursor: null,
})

it('renders historical null final URL as unavailable, never as source URL, and keeps evidence escaped', () => {
  const value = detail(null)
  const wrapper = mount(CitationDetail, { props: { detail: value, pending: false } })
  expect(wrapper.text()).toContain('Final URL: Unavailable (historical provenance not recorded)')
  expect(wrapper.text()).toContain(
    'Source: https://www.moneydigest.sg/wp-content/uploads/original.png',
  )
  expect(wrapper.text()).not.toContain('Final URL: https://www.moneydigest.sg/')
  expect(wrapper.get('pre').text()).toBe(value.snapshot)
  expect(wrapper.find('script').exists()).toBe(false)
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.find('a').exists()).toBe(false)
  wrapper.unmount()
})

it('renders actual recorded final provenance separately from the source URL', () => {
  const value = detail('https://i0.wp.com/www.moneydigest.sg/wp-content/uploads/final.png')
  const wrapper = mount(CitationDetail, { props: { detail: value, pending: false } })
  expect(wrapper.text()).toContain(`Final URL: ${value.images[0]?.finalUrl}`)
  expect(wrapper.text()).not.toContain('historical provenance not recorded')
  wrapper.unmount()
})
