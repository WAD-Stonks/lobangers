import { parseConfig } from '@api/config'
import { parseMoneyDigestPost } from '@api/modules/ingestion/parser'
import { createIngestionRuntime } from '@api/modules/ingestion/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'

const base = {
  DATABASE_URL: 'mongodb://127.0.0.1:27017/synthetic',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
}
afterEach(() => vi.unstubAllGlobals())
describe('production runtime composition with mocked external HTTP only', () => {
  it('composes all source clients with the persisted Telegram URL and literal provider IDs', async () => {
    const body =
      'Singapore pizza 25% off. Valid from 1 October 2026 until 31 December 2026. All outlets. No membership required.'
    const providerFetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.startsWith('https://t.me/s/SyntheticDeals'))
        return new Response(
          `<a class="tgme_channel_info_header_username" href="https://t.me/SyntheticDeals">@SyntheticDeals</a><div class="tgme_widget_message" data-post="SyntheticDeals/123"><div class="tgme_widget_message_text">Acme pizza<br>${body}</div><a class="tgme_widget_message_date" href="https://t.me/SyntheticDeals/123"><time datetime="2026-10-20T00:00:00Z"></time></a></div>`,
          { headers: { 'Content-Type': 'text/html' } },
        )
      if (url.startsWith('https://public-api.wordpress.com/'))
        return new Response(
          JSON.stringify([
            {
              id: 123,
              link: 'https://scoobifydaily.wordpress.com/synthetic',
              date_gmt: '2026-10-20T00:00:00',
              modified_gmt: null,
              title: { rendered: 'Acme pizza' },
              content: { rendered: body },
              excerpt: { rendered: '' },
            },
          ]),
          { headers: { 'Content-Type': 'application/json' } },
        )
      throw new Error('Unexpected provider URL')
    })
    vi.stubGlobal('fetch', providerFetch)
    const runtime = createIngestionRuntime(
      parseConfig({ ...base, INGESTION_ENABLED: 'true', SCOOBIFY_REUSE_APPROVED: 'true' }),
    )
    expect(runtime.sourceRuntime).toBeDefined()
    const { parseSourcePost } = await import('@api/modules/ingestion/source-post')
    const telegram = {
      kind: 'telegram' as const,
      provider: 'TELEGRAM' as const,
      externalId: 'syntheticdeals',
      name: 'Synthetic Deals',
      url: 'https://t.me/s/SyntheticDeals',
    }
    const result = await runtime.sourceRuntime?.(telegram).listPosts({ page: 1, perPage: 20 })
    expect(result?.posts[0]).toMatchObject({
      externalId: 'SyntheticDeals/123',
      url: 'https://t.me/SyntheticDeals/123',
    })
    expect(parseSourcePost(result?.posts[0], telegram).draft).toMatchObject({
      offerType: 'PERCENT_OFF',
      discountPercent: 25,
    })
    const scoobify = {
      kind: 'scoobify' as const,
      provider: 'WORDPRESS' as const,
      externalId: 'scoobifydaily.wordpress.com',
      name: 'Scoobify Daily',
      url: 'https://scoobifydaily.wordpress.com/',
    }
    const wp = await runtime.sourceRuntime?.(scoobify).listPosts({ page: 1, perPage: 20 })
    expect(runtime.sourceRuntime?.(scoobify).reuseApproved).toBe(true)
    expect(parseSourcePost(wp?.posts[0], scoobify).draft).toMatchObject({ discountPercent: 25 })
    expect(providerFetch).toHaveBeenCalledTimes(2)
  })
  it('composes imported media using the real UploadThing server SDK and existing storage config', async () => {
    const token = Buffer.from(
      JSON.stringify({
        apiKey: `sk_${'synthetic'.repeat(8)}`,
        appId: 'synthetic-app',
        regions: ['sea1'],
      }),
    ).toString('base64')
    const runtime = createIngestionRuntime(
      parseConfig({ ...base, PHOTO_STORAGE_PROVIDER: 'uploadthing', UPLOADTHING_TOKEN: token }),
    )
    expect(runtime.imageStorage).toBeDefined()
    const { UTApi } = await import('@broke-oclock/storage/server')
    const upload = vi.spyOn(UTApi.prototype, 'uploadFiles').mockResolvedValue({
      data: { key: 'synthetic-key', ufsUrl: 'https://synthetic.ufs.sh/f/synthetic-key', size: 3 },
      error: null,
    } as never)
    const lookup = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ key: 'synthetic-key', url: 'https://synthetic.ufs.sh/f/synthetic-key' }],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', lookup)
    try {
      const bytes = new Uint8Array([1, 2, 3])
      expect(
        await runtime.imageStorage?.upload(
          {
            bytes,
            byteLength: 3,
            sha256: 'a'.repeat(64),
            mimeType: 'image/jpeg',
            url: 'https://www.moneydigest.sg/a.jpg',
            finalUrl: 'https://www.moneydigest.sg/a.jpg',
          },
          'ingested-sha256-test',
        ),
      ).toEqual({ key: 'synthetic-key', url: 'https://synthetic.ufs.sh/f/synthetic-key' })
      const file = upload.mock.calls[0]?.[0]
      expect(file).toMatchObject({ customId: 'ingested-sha256-test', type: 'image/jpeg', size: 3 })
      expect(await runtime.imageStorage?.resolve('ingested-sha256-test')).toEqual({
        key: 'synthetic-key',
        url: 'https://synthetic.ufs.sh/f/synthetic-key',
      })
      expect(lookup).toHaveBeenCalledTimes(1)
      expect(String(lookup.mock.calls[0]?.[0])).toContain('getFileUrl')
    } finally {
      upload.mockRestore()
    }
  })
  it('constructs without requests and accepts the real transport canonical MoneyDigest host', async () => {
    const providerFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 901,
            link: 'https://www.moneydigest.sg/synthetic-deal/',
            date: '2026-10-01T12:00:00',
            title: { rendered: 'Synthetic Pizza' },
            content: {
              rendered:
                'Singapore pizza 1-for-1. Valid from 1 October 2026 until 31 December 2026.',
            },
            excerpt: { rendered: '' },
          },
        ]),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', providerFetch)
    const runtime = createIngestionRuntime(
      parseConfig({ ...base, INGESTION_ENABLED: 'true', MONEYDIGEST_REUSE_APPROVED: 'true' }),
    )
    expect(providerFetch).not.toHaveBeenCalled()
    const posts = await runtime.listPosts({ page: 1, perPage: 20 })
    expect(providerFetch).toHaveBeenCalledTimes(1)
    expect(String(providerFetch.mock.calls[0]?.[0])).toContain(
      'https://www.moneydigest.sg/wp-json/wp/v2/posts?',
    )
    expect(parseMoneyDigestPost(posts[0])).toMatchObject({
      status: 'NEEDS_REVIEW',
      draft: {
        validFrom: new Date('2026-09-30T16:00:00Z'),
        validUntil: new Date('2026-12-31T16:00:00Z'),
      },
    })
  })
})
