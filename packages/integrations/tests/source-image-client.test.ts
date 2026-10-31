import { createHash } from 'node:crypto'
import { createSourceImageClient, isPublicSourceAddress } from '@integrations/source-image-client'
import { describe, expect, it, vi } from 'vitest'

const url = 'https://cdn5.telesco.pe/file/promo.jpg'
const jpeg = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 255, 217])
const resolveHost = vi.fn(async () => [{ address: '149.154.167.99', family: 4 }])
const imageResponse = (bytes = jpeg, mime = 'image/jpeg', headers = {}) =>
  new Response(bytes, { headers: { 'content-type': mime, ...headers } })

describe('safe source image transport (synthetic fixtures; not decode validity)', () => {
  it('returns real bytes/hash and distinct source/fetch URLs after safe legacy upgrade', async () => {
    const fetch = vi.fn().mockResolvedValue(imageResponse())
    const original = 'http://www.moneydigest.sg/wp-content/uploads/2015/01/promo.jpg'
    const result = await createSourceImageClient({ fetch, resolveHost }).fetchImage(original, {
      source: 'moneydigest',
    })
    expect(result).toMatchObject({
      bytes: jpeg,
      mimeType: 'image/jpeg',
      byteLength: jpeg.length,
      sha256: createHash('sha256').update(jpeg).digest('hex'),
      url: original,
      fetchUrl: original.replace('http:', 'https:'),
      finalUrl: original.replace('http:', 'https:'),
    })
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual', credentials: 'omit' })
    expect(fetch.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization')
  })
  it('allows observed exact CDN families and WordPress originals', async () => {
    for (const [value, source] of [
      ['https://cdn4.telesco.pe/file/x.jpg', 'telegram'],
      ['https://cdn5.cdn-telegram.org/file/x.jpg', 'telegram'],
      ['https://scoobifydaily.wordpress.com/wp-content/uploads/x.jpg', 'scoobify'],
      ['https://scoobifydaily.files.wordpress.com/2024/01/x.jpg', 'scoobify'],
      ['https://i0.wp.com/www.moneydigest.sg/wp-content/uploads/x.jpg', 'moneydigest'],
    ] as const)
      expect(
        (
          await createSourceImageClient({
            fetch: vi.fn().mockResolvedValue(imageResponse()),
            resolveHost,
          }).fetchImage(value, { source })
        ).byteLength,
      ).toBe(jpeg.length)
  })
  it('accepts canonical/parameterized PNG and WebP only when the magic agrees', async () => {
    const png = new Uint8Array(24)
    png.set([137, 80, 78, 71, 13, 10, 26, 10])
    png.set([73, 72, 68, 82], 12)
    const webp = new Uint8Array(16)
    webp.set([82, 73, 70, 70], 0)
    webp.set([87, 69, 66, 80, 86, 80, 56, 32], 8)
    for (const [bytes, mime, expected] of [
      [png, 'Image/PNG; charset=binary', 'image/png'],
      [webp, 'image/webp', 'image/webp'],
    ] as const) {
      const result = await createSourceImageClient({
        fetch: vi.fn().mockResolvedValue(imageResponse(bytes, mime)),
        resolveHost,
      }).fetchImage(url, { source: 'telegram' })
      expect(result.mimeType).toBe(expected)
    }
  })
  it('blocks private DNS at a redirect target before its request', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://cdn4.telesco.pe/file/next.jpg' },
      }),
    )
    const dns = vi
      .fn()
      .mockResolvedValueOnce([{ address: '149.154.167.99', family: 4 }])
      .mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }])
    await expect(
      createSourceImageClient({ fetch, resolveHost: dns }).fetchImage(url, { source: 'telegram' }),
    ).rejects.toThrow(/UNSAFE_URL/)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('blocks URL attacks before DNS/fetch', async () => {
    const fetch = vi.fn()
    const dns = vi.fn()
    for (const value of [
      'https://evil.test/x.jpg',
      'https://cdn5.telesco.pe.evil.test/file/x',
      'https://a.cdn5.telesco.pe/file/x',
      'https://cdn5.telesco.pe@127.0.0.1/file/x',
      'https://u:p@cdn5.telesco.pe/file/x',
      'http://cdn5.telesco.pe/file/x',
      'https://cdn5.telesco.pe:444/file/x',
      'https://cdn5.telesco.pe/other/x',
      'https://cdn5.telesco.pe/file/%2e%2e%2fsecret',
      'https://cdn5.telesco.pe/file/x#frag',
      'https://cdn5.telesco.pe\\@evil/file/x',
    ])
      await expect(
        createSourceImageClient({ fetch, resolveHost: dns }).fetchImage(value, {
          source: 'telegram',
        }),
      ).rejects.toThrow(/UNSAFE_URL/)
    expect(fetch).not.toHaveBeenCalled()
    expect(dns).not.toHaveBeenCalled()
  })
  it('rejects all private/reserved/mapped addresses and mixed public/private DNS', async () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.1',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '198.18.0.1',
      '192.0.2.1',
      '203.0.113.1',
      '224.0.0.1',
      '::1',
      'fc00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '2001:db8::1',
      '2002:7f00:1::',
    ])
      expect(isPublicSourceAddress(ip)).toBe(false)
    expect(isPublicSourceAddress('192.0.78.12')).toBe(true)
    expect(isPublicSourceAddress('2606:4700:4700::1111')).toBe(true)
    const fetch = vi.fn()
    await expect(
      createSourceImageClient({
        fetch,
        resolveHost: async () => [
          { address: '149.154.167.99', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ],
      }).fetchImage(url, { source: 'telegram' }),
    ).rejects.toThrow(/UNSAFE_URL/)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('validates each redirect and DNS answer; limits redirects and forbids downgrade', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://cdn4.telesco.pe/file/y.jpg' },
        }),
      )
      .mockResolvedValueOnce(imageResponse())
    const dns = vi.fn().mockResolvedValue([{ address: '149.154.167.99', family: 4 }])
    expect(
      (
        await createSourceImageClient({ fetch, resolveHost: dns }).fetchImage(url, {
          source: 'telegram',
        })
      ).finalUrl,
    ).toContain('cdn4')
    expect(dns).toHaveBeenCalledTimes(2)
    for (const location of [
      'https://evil.test/secret',
      'http://cdn4.telesco.pe/file/x',
      'http://169.254.169.254/latest/meta-data',
    ]) {
      const request = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 302, headers: { location } }))
      await expect(
        createSourceImageClient({ fetch: request, resolveHost }).fetchImage(url, {
          source: 'telegram',
        }),
      ).rejects.toThrow(/UNSAFE_URL/)
      expect(request).toHaveBeenCalledTimes(1)
    }
    const loop = vi.fn().mockImplementation(
      (target: URL) =>
        new Response(null, {
          status: 302,
          headers: { location: target.href.replace(/\.jpg$/, 'x.jpg') },
        }),
    )
    await expect(
      createSourceImageClient({ fetch: loop, resolveHost }).fetchImage(url, { source: 'telegram' }),
    ).rejects.toThrow(/UNSAFE_URL/)
    expect(loop).toHaveBeenCalledTimes(4)
  })
  it('rejects HTML/SVG and MIME mismatches, declared and streamed oversize', async () => {
    for (const response of [
      imageResponse(new TextEncoder().encode('<html>oops</html>'), 'image/jpeg'),
      imageResponse(jpeg, 'image/svg+xml'),
      imageResponse(jpeg, 'image/png'),
      imageResponse(jpeg, 'image/jpeg', { 'content-length': '99999' }),
      imageResponse(new Uint8Array(30), 'image/jpeg'),
    ])
      await expect(
        createSourceImageClient({
          fetch: vi.fn().mockResolvedValue(response),
          resolveHost,
          maxBytes: 20,
        }).fetchImage(url, { source: 'telegram' }),
      ).rejects.toThrow()
  })
  it('does not retry security, 429, or Retry-After; at most two transient attempts', async () => {
    for (const response of [
      new Response(null, { status: 429 }),
      new Response(null, { status: 503, headers: { 'Retry-After': '60' } }),
      imageResponse(new Uint8Array([1, 2, 3])),
    ]) {
      const fetch = vi.fn().mockResolvedValue(response)
      await expect(
        createSourceImageClient({ fetch, resolveHost }).fetchImage(url, { source: 'telegram' }),
      ).rejects.toThrow()
      expect(fetch).toHaveBeenCalledTimes(1)
    }
    const fetch = vi.fn().mockRejectedValue(new Error('synthetic network outage'))
    await expect(
      createSourceImageClient({ fetch, resolveHost }).fetchImage(url, { source: 'telegram' }),
    ).rejects.toThrow(/NETWORK_ERROR/)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('cancels a fetch response that arrives after the complete-operation deadline', async () => {
    const cancel = vi.fn()
    let deliver: ((response: Response) => void) | undefined
    const fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          deliver = resolve
        }),
    )
    const pending = createSourceImageClient({ fetch, resolveHost, timeoutMs: 10 }).fetchImage(url, {
      source: 'telegram',
    })
    await expect(pending).rejects.toThrow(/TIMEOUT/)
    deliver?.(
      new Response(new ReadableStream({ start() {}, cancel }), {
        headers: { 'content-type': 'image/jpeg' },
      }),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('deadlines cover DNS, ignored fetch aborts, stalled bodies and late responses', async () => {
    const lateCancel = vi.fn()
    const cases = [
      { resolveHost: async () => new Promise<never>(() => {}), fetch: vi.fn() },
      { resolveHost, fetch: vi.fn().mockImplementation(() => new Promise(() => {})) },
      {
        resolveHost,
        fetch: vi.fn().mockResolvedValue(
          new Response(new ReadableStream({ start() {}, cancel: lateCancel }), {
            headers: { 'content-type': 'image/jpeg' },
          }),
        ),
      },
    ]
    for (const options of cases)
      await expect(
        createSourceImageClient({ ...options, timeoutMs: 10 }).fetchImage(url, {
          source: 'telegram',
        }),
      ).rejects.toThrow(/TIMEOUT/)
    expect(lateCancel).toHaveBeenCalled()
  })
})
