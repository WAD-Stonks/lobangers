import { extractSourceImages } from '@integrations/ingestion-source-post'
import { createScoobifyClient } from '@integrations/scoobify-client'
import { createTelegramClient, parseTelegramPreviewUrl } from '@integrations/telegram-client'
import { describe, expect, it, vi } from 'vitest'

const html = (body: string) => new Response(body, { headers: { 'content-type': 'text/html' } })
const telegram = (id = '12', channel = 'ThisCounted') =>
  `<html><a class="tgme_channel_info_header_username" href="https://t.me/ThisCounted">@ThisCounted</a><div class="tgme_widget_message" data-post="${channel}/${id}"><img class="tgme_widget_message_user_photo" src="https://cdn5.telesco.pe/file/avatar.jpg"><a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn5.telesco.pe/file/promo.jpg')"></a><div class="tgme_widget_message_text js-message_text"><b>Title &amp; deal</b><br>One<div>Nested <b>two</b></div><br>End</div><a class="tgme_widget_message_date" href="https://t.me/ThisCounted/${id}"><time datetime="2026-10-20T01:00:00+00:00"></time></a></div></html>`
const wp = () => ({
  id: 17,
  link: 'https://scoobifydaily.wordpress.com/2026/10/20/promo/',
  date: '2026-10-20T09:00:00',
  date_gmt: '2026-10-20T01:00:00',
  modified_gmt: null,
  title: { rendered: ' Whole &amp; title ' },
  content: { rendered: '<p>Original <b>text</b><br>Terms</p>' },
  excerpt: { rendered: '<p>Excerpt</p>' },
})
const json = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })

describe('public source adapters (synthetic fixtures)', () => {
  it('accepts separately configured public previews, normalizes registry identity and preserves provider IDs', async () => {
    for (const channel of ['ThisCounted', 'DifferentDeals']) {
      const fetch = vi
        .fn()
        .mockResolvedValue(html(telegram('12', channel).replaceAll('ThisCounted', channel)))
      const previewUrl = `https://t.me/s/${channel.toLowerCase()}`
      expect(parseTelegramPreviewUrl(previewUrl).sourceExternalId).toBe(channel.toLowerCase())
      const result = await createTelegramClient({ previewUrl, fetch }).listPosts({
        page: 1,
        perPage: 20,
      })
      expect(result.posts[0]?.externalId).toBe(`${channel}/12`)
      expect(String(fetch.mock.calls[0]?.[0])).toBe(previewUrl)
      fetch.mockResolvedValueOnce(html(telegram('11', channel).replaceAll('ThisCounted', channel)))
      await createTelegramClient({ previewUrl, fetch }).listPosts({
        page: 2,
        perPage: 20,
        cursor: '12',
      })
      expect(String(fetch.mock.calls[1]?.[0])).toBe(`${previewUrl}?before=12`)
    }
  })
  it('rejects non-preview/private/invite/credential/port/query/hash URLs and cross-channel data', async () => {
    const fetch = vi.fn()
    for (const previewUrl of [
      'http://t.me/s/ThisCounted',
      'https://evil.test/s/ThisCounted',
      'https://t.me.evil/s/ThisCounted',
      'https://t.me/ThisCounted',
      'https://t.me/s/c',
      'https://t.me/c/123/4',
      'https://t.me/+invite',
      'https://t.me/s/joinchat',
      'https://t.me/s/ThisCounted?before=4',
      'https://t.me:443/s/ThisCounted',
      'https://u:p@t.me/s/ThisCounted',
      'https://t.me/s/ThisCounted#x',
      'https://t.me/s/../s/ThisCounted',
      'https://t.me/s/%54hisCounted',
      `https://t.me/s/${'a'.repeat(33)}`,
    ])
      expect(() => createTelegramClient({ previewUrl, fetch })).toThrow(/INVALID_INPUT/)
    expect(fetch).not.toHaveBeenCalled()
    await expect(
      createTelegramClient({
        previewUrl: 'https://t.me/s/DifferentDeals',
        fetch: vi.fn().mockResolvedValue(html(telegram())),
      }).listPosts({ page: 1, perPage: 20 }),
    ).rejects.toThrow(/MALFORMED_RESPONSE/)
    await expect(
      createTelegramClient({ previewUrl: 'https://t.me/s/ThisCounted', fetch }).listPosts({
        page: 2,
        perPage: 20,
        cursor: 'DifferentDeals/12',
      }),
    ).rejects.toThrow(/INVALID_INPUT/)
  })
  it('keeps nested Telegram HTML, original text and actual photo; literal cursor', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(html(telegram()))
    const result = await createTelegramClient({ fetch }).listPosts({ page: 1, perPage: 20 })
    expect(result.posts).toHaveLength(1)
    expect(result.posts[0]).toMatchObject({
      externalId: 'ThisCounted/12',
      url: 'https://t.me/ThisCounted/12',
      title: 'Title & deal',
      contentHtml: '<b>Title &amp; deal</b><br>One<div>Nested <b>two</b></div><br>End',
      sourceUpdatedAt: null,
      images: [{ url: 'https://cdn5.telesco.pe/file/promo.jpg' }],
    })
    expect(result.nextCursor).toBe('12')
    fetch.mockResolvedValueOnce(html(telegram('11')))
    await createTelegramClient({ fetch }).listPosts({ page: 2, perPage: 20, cursor: '12' })
    expect(String(fetch.mock.calls[1]?.[0])).toBe('https://t.me/s/ThisCounted?before=12')
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error', credentials: 'omit' })
  })
  it('rejects foreign/duplicate/malformed IDs and missing channel marker', async () => {
    for (const body of [
      telegram('01'),
      telegram('12', 'Other'),
      telegram() + telegram(),
      telegram().replace('tgme_channel_info_header_username', 'missing'),
    ]) {
      await expect(
        createTelegramClient({ fetch: vi.fn().mockResolvedValue(html(body)) }).listPosts({
          page: 1,
          perPage: 20,
        }),
      ).rejects.toThrow()
    }
  })
  it('caps returned Telegram posts without skipping older cursor rows', async () => {
    const body = telegram('11') + telegram('12') + telegram('13')
    const result = await createTelegramClient({
      fetch: vi.fn().mockResolvedValue(html(body)),
    }).listPosts({ page: 1, perPage: 2 })
    expect(result.posts.map((post) => post.externalId)).toEqual([
      'ThisCounted/13',
      'ThisCounted/12',
    ])
    expect(result.nextCursor).toBe('12')
  })
  it('validates pagination and bounds before network', async () => {
    const fetch = vi.fn()
    for (const client of [createTelegramClient({ fetch }), createScoobifyClient({ fetch })]) {
      for (const input of [
        { page: 0, perPage: 20 },
        { page: 1, perPage: 21 },
        { page: 1, perPage: 1, cursor: 'https://evil' },
      ])
        await expect(client.listPosts(input)).rejects.toThrow()
    }
    await expect(
      createTelegramClient({ fetch }).listPosts({ page: 2, perPage: 20 }),
    ).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('validates Scoobify shape and GMT, preserves rendered fields', async () => {
    const fetch = vi.fn().mockResolvedValue(json([wp()]))
    const result = await createScoobifyClient({ fetch }).listPosts({ page: 1, perPage: 20 })
    expect(result.posts[0]).toMatchObject({
      externalId: '17',
      publishedAt: '2026-10-20T01:00:00.000Z',
      title: ' Whole &amp; title ',
      contentHtml: wp().content.rendered,
    })
    const url = new URL(String(fetch.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/wp/v2/sites/scoobifydaily.wordpress.com/posts')
    expect(url.searchParams.get('per_page')).toBe('20')
    const noGmt = { ...wp(), date_gmt: undefined }
    expect(
      (
        await createScoobifyClient({ fetch: vi.fn().mockResolvedValue(json([noGmt])) }).listPosts({
          page: 1,
          perPage: 20,
        })
      ).posts[0]?.publishedAt,
    ).toBeNull()
    for (const data of [
      { code: 'error' },
      [{ ...wp(), id: '17' }],
      [{ ...wp(), link: 'https://evil.test' }],
      [{ ...wp(), date_gmt: '2026-02-30T01:00:00' }],
    ])
      await expect(
        createScoobifyClient({ fetch: vi.fn().mockResolvedValue(json(data)) }).listPosts({
          page: 1,
          perPage: 20,
        }),
      ).rejects.toThrow()
  })
  it('uses bounded WordPress page cursors consistently with the next-page contract', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json([wp()]))
      .mockResolvedValueOnce(json([wp()]))
    const client = createScoobifyClient({ fetch })
    expect((await client.listPosts({ page: 1, perPage: 1 })).nextCursor).toBe('2')
    await client.listPosts({ page: 2, perPage: 1, cursor: '2' })
    expect(new URL(String(fetch.mock.calls[1]?.[0])).searchParams.get('page')).toBe('2')
    await expect(client.listPosts({ page: 2, perPage: 1, cursor: '3' })).rejects.toThrow(
      /INVALID_INPUT/,
    )
  })
  it('rejects redirects, HTTP rate limits, duplicate posts and declared oversized JSON', async () => {
    for (const response of [
      new Response(null, { status: 429 }),
      new Response(null, { status: 302, headers: { location: 'https://evil.test/' } }),
      json([wp(), wp()]),
      new Response('[]', {
        headers: { 'content-type': 'application/json', 'content-length': '1048577' },
      }),
    ]) {
      const fetch = vi.fn().mockResolvedValue(response)
      await expect(
        createScoobifyClient({ fetch }).listPosts({ page: 1, perPage: 20 }),
      ).rejects.toThrow()
      expect(fetch).toHaveBeenCalledTimes(1)
    }
  })
  it('rejects oversized/content-type responses and bounds full body timeout', async () => {
    await expect(
      createTelegramClient({
        fetch: vi.fn().mockResolvedValue(html('a'.repeat(500_001))),
      }).listPosts({ page: 1, perPage: 20 }),
    ).rejects.toThrow()
    await expect(
      createScoobifyClient({ fetch: vi.fn().mockResolvedValue(html('[]')) }).listPosts({
        page: 1,
        perPage: 20,
      }),
    ).rejects.toThrow()
    const stalled = new Response(new ReadableStream({ start() {} }), {
      headers: { 'content-type': 'text/html' },
    })
    await expect(
      createTelegramClient({ fetch: vi.fn().mockResolvedValue(stalled), timeoutMs: 10 }).listPosts({
        page: 1,
        perPage: 20,
      }),
    ).rejects.toThrow(/TIMEOUT/)
  })
  it('extracts max five originals; excludes icons, untrusted hosts and tiny images', () => {
    const body =
      `<img width="27" height="27" src="https://www.moneydigest.sg/wp-content/uploads/facebook.png"><img src="https://www.moneydigest.sg/wp-content/uploads/small.jpg" data-orig-file="http://www.moneydigest.sg/wp-content/uploads/original.jpg"><img src="https://evil.test/promo.jpg"><img src="https://www.moneydigest.sg/wp-content/uploads/logo.png">` +
      Array.from(
        { length: 8 },
        (_, i) => `<img src="https://www.moneydigest.sg/wp-content/uploads/promo${i}.jpg">`,
      ).join('')
    const images = extractSourceImages(body, 'https://www.moneydigest.sg/', 'moneydigest')
    expect(images).toHaveLength(5)
    expect(images[0]?.url).toBe('http://www.moneydigest.sg/wp-content/uploads/original.jpg')
    expect(images.some((image) => /facebook|logo|evil/.test(image.url))).toBe(false)
  })
})
