import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { Readable } from 'node:stream'
import {
  boundedInteger,
  fail,
  readSourceBytes,
  SourceClientError,
  type SourceKind,
  sourceImageUrl,
  withSourceDeadline,
} from '@integrations/ingestion-source-post'

export interface SourceImageClientOptions {
  /** Trusted test seam only. The production default pins a validated DNS result in node:https. */
  fetch?: typeof fetch
  timeoutMs?: number
  maxBytes?: number
  /** Trusted resolver seam for deterministic offline tests. Every returned address is checked. */
  resolveHost?: (hostname: string) => Promise<ReadonlyArray<{ address: string; family: number }>>
}
export interface SourceImage {
  bytes: Uint8Array
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  byteLength: number
  sha256: string
  /** Exact source reference, including a legacy HTTP scheme. */
  url: string
  /** Initial HTTPS fetch URL; upgrades only the known MoneyDigest upload path. */
  fetchUrl: string
  finalUrl: string
}
export const isPublicSourceAddress = (address: string): boolean => {
  if (isIP(address) === 4) {
    const [a = 0, b = 0, c = 0] = address.split('.').map(Number)
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && ((b === 0 && (c === 0 || c === 2)) || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    )
  }
  if (isIP(address) === 6) {
    // Fail closed outside global-unicast 2000::/3, including IPv4-mapped addresses.
    const groups = address.toLowerCase().split(':')
    const first = Number.parseInt(groups[0] ?? '', 16)
    const second = Number.parseInt(groups[1] || '0', 16)
    return (
      first >= 0x2000 &&
      first <= 0x3fff &&
      !(first === 0x2001 && (second < 0x200 || second === 0xdb8)) &&
      first !== 0x2002 &&
      !(first === 0x3fff && second < 0x1000)
    )
  }
  return false
}
const pinnedFetch = async (
  url: URL,
  address: { address: string; family: number },
  signal: AbortSignal,
): Promise<Response> =>
  new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: 'GET',
        signal,
        agent: false,
        family: address.family,
        headers: { Accept: 'image/jpeg,image/png,image/webp', 'Accept-Encoding': 'identity' },
        // TLS SNI/certificate validation remains bound to url.hostname. Only DNS is pinned.
        lookup: (_host, _options, callback) => callback(null, address.address, address.family),
      },
      (incoming) => {
        // Keep native stream errors observed even when conversion fails before toWeb
        // can own the stream. Never pass an error to destroy on an unowned response.
        incoming.on('error', () => reject(new SourceClientError('MALFORMED_RESPONSE')))
        try {
          const status = incoming.statusCode
          if (!Number.isInteger(status) || status === undefined || status < 200 || status > 599)
            return fail('MALFORMED_RESPONSE')
          const headers = new Headers()
          for (const [name, value] of Object.entries(incoming.headers))
            if (value !== undefined)
              headers.set(name, Array.isArray(value) ? value.join(', ') : value)
          if ([204, 205, 304].includes(status)) {
            const response = new Response(null, { status, headers })
            // These statuses cannot expose a WHATWG body to the caller, so no
            // reader/byte limit can own or cancel a native body. Do not drain it.
            incoming.destroy()
            request.destroy()
            resolve(response)
            return
          }
          resolve(
            new Response(Readable.toWeb(incoming) as ReadableStream<Uint8Array>, {
              status,
              headers,
            }),
          )
        } catch {
          // Callback exceptions do not reject the outer promise automatically. A
          // malformed response is not a transient network failure safe to resend.
          reject(new SourceClientError('MALFORMED_RESPONSE'))
          incoming.destroy()
          request.destroy()
        }
      },
    )
    request.on('error', (error: NodeJS.ErrnoException) => {
      // Certificate/TLS policy failures are never transient transport retries.
      const tlsFailure = /CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO/.test(
        error.code ?? '',
      )
      reject(new SourceClientError(tlsFailure ? 'UNSAFE_URL' : 'NETWORK_ERROR'))
    })
    request.end()
  })
const sniffImage = (bytes: Uint8Array): SourceImage['mimeType'] => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg'
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte) &&
    Buffer.from(bytes.subarray(12, 16)).toString('ascii') === 'IHDR'
  )
    return 'image/png'
  if (
    bytes.length >= 16 &&
    Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' &&
    Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP' &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(Buffer.from(bytes.subarray(12, 16)).toString('ascii'))
  )
    return 'image/webp'
  return fail('IMAGE_TYPE')
}
/** Real bounded image bytes, never uploads or fabricated storage records. Fixed source
 * CDN/path allowlist, all DNS answers checked and pinned by default, <=3 redirects,
 * <=2 transport attempts (only network/502/503/504; never rate-limit/security retries).
 * Callers own content rights, archive/storage, retention and downstream image decoding. */
export const createSourceImageClient = (options: SourceImageClientOptions = {}) => {
  const timeoutMs = boundedInteger(options.timeoutMs ?? 15_000, 15_000)
  const maxBytes = boundedInteger(options.maxBytes ?? 8_388_608, 10_485_760)
  const resolveHost =
    options.resolveHost ?? ((hostname: string) => lookup(hostname, { all: true, verbatim: true }))
  return {
    fetchImage: async (
      originalUrl: string,
      input: { source: SourceKind },
    ): Promise<SourceImage> => {
      if (!input || !['moneydigest', 'scoobify', 'telegram'].includes(input.source))
        return fail('INVALID_INPUT')
      const initialUrl = sourceImageUrl(originalUrl, input.source)
      return withSourceDeadline(timeoutMs, async (signal) => {
        let target = initialUrl
        let redirects = 0
        let attempts = 0
        const visited = new Set<string>()
        for (;;) {
          if (signal.aborted) return fail('TIMEOUT')
          if (visited.has(target.href)) return fail('UNSAFE_URL')
          visited.add(target.href)
          const addresses = await resolveHost(target.hostname)
          if (signal.aborted) return fail('TIMEOUT')
          if (
            !addresses.length ||
            addresses.length > 64 ||
            addresses.some(
              (item) => !isPublicSourceAddress(item.address) || isIP(item.address) !== item.family,
            )
          )
            return fail('UNSAFE_URL')
          const address = addresses.find((item) => item.family === 4) ?? addresses[0]
          if (!address) return fail('UNSAFE_URL')
          let response: Response
          try {
            response = options.fetch
              ? await options.fetch(target, {
                  method: 'GET',
                  credentials: 'omit',
                  redirect: 'manual',
                  headers: { Accept: 'image/jpeg,image/png,image/webp' },
                  signal,
                })
              : await pinnedFetch(target, address, signal)
          } catch (error) {
            if (signal.aborted) return fail('TIMEOUT')
            if (error instanceof SourceClientError && error.code !== 'NETWORK_ERROR') throw error
            if (++attempts < 2) {
              visited.delete(target.href)
              continue
            }
            return fail('NETWORK_ERROR')
          }
          if (signal.aborted) {
            void response.body?.cancel().catch(() => {})
            return fail('TIMEOUT')
          }
          if (response.redirected || (response.url && response.url !== target.href)) {
            void response.body?.cancel().catch(() => {})
            return fail('UNSAFE_URL')
          }
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            void response.body?.cancel().catch(() => {})
            if (++redirects > 3) return fail('UNSAFE_URL')
            const location = response.headers.get('location')
            if (!location) return fail('UNSAFE_URL')
            let resolved: URL
            try {
              resolved = new URL(location, target)
            } catch {
              return fail('UNSAFE_URL')
            }
            // Redirects must already be HTTPS, unlike explicitly recorded legacy originals.
            if (resolved.protocol !== 'https:') return fail('UNSAFE_URL')
            target = sourceImageUrl(resolved.href, input.source)
            continue
          }
          if (!response.ok) {
            void response.body?.cancel().catch(() => {})
            if (
              [502, 503, 504].includes(response.status) &&
              !response.headers.has('retry-after') &&
              ++attempts < 2
            ) {
              visited.delete(target.href)
              continue
            }
            throw new SourceClientError('HTTP_ERROR', response.status)
          }
          const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
          if (
            !['image/jpeg', 'image/png', 'image/webp'].includes(mime ?? '') ||
            (response.headers.has('content-encoding') &&
              response.headers.get('content-encoding') !== 'identity')
          ) {
            void response.body?.cancel().catch(() => {})
            return fail('IMAGE_TYPE')
          }
          const bytes = await readSourceBytes(response, maxBytes, signal)
          const mimeType = sniffImage(bytes)
          if (mime !== mimeType) return fail('IMAGE_TYPE')
          return {
            bytes,
            mimeType,
            byteLength: bytes.byteLength,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            url: originalUrl,
            fetchUrl: initialUrl.href,
            finalUrl: target.href,
          }
        }
      })
    },
  }
}
