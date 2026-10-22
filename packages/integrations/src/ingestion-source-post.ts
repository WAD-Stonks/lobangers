/** Transport DTOs only. Every HTML field is untrusted evidence, never safe to render. */
export interface SourcePost {
  externalId: string
  url: string
  publishedAt: string | null
  sourceUpdatedAt: string | null
  title: string
  contentHtml: string
  excerptHtml: string
  images: ReadonlyArray<{ url: string; altText?: string }>
}
export type SourceKind = 'moneydigest' | 'scoobify' | 'telegram'
export interface SourceListOptions {
  page: number
  perPage: number
  cursor?: string | null
}
export interface SourceClient {
  listPosts(
    options: SourceListOptions,
  ): Promise<{ posts: ReadonlyArray<SourcePost>; nextCursor: string | null }>
}
export interface SourceClientOptions {
  fetch?: typeof fetch
  timeoutMs?: number
}
export class SourceClientError extends Error {
  constructor(
    readonly code:
      | 'INVALID_INPUT'
      | 'MALFORMED_RESPONSE'
      | 'HTTP_ERROR'
      | 'NETWORK_ERROR'
      | 'TIMEOUT'
      | 'UNSAFE_URL'
      | 'IMAGE_TYPE'
      | 'TOO_LARGE',
    readonly status?: number,
  ) {
    super(`Source request failed: ${code}`)
    this.name = 'SourceClientError'
  }
}
export const fail = (code: ConstructorParameters<typeof SourceClientError>[0]): never => {
  throw new SourceClientError(code)
}
export const boundedInteger = (value: number, max: number): number =>
  Number.isSafeInteger(value) && value > 0 && value <= max ? value : fail('INVALID_INPUT')
export const validateList = (options: SourceListOptions): void => {
  if (!options || typeof options !== 'object') fail('INVALID_INPUT')
  boundedInteger(options.page, 10_000)
  boundedInteger(options.perPage, 20)
}
export const parseSourceDate = (value: unknown, gmt = false): string | null => {
  if (value == null) return null
  if (
    typeof value !== 'string' ||
    !(
      gmt
        ? /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z?$/
        : /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/
    ).test(value)
  )
    return fail('MALFORMED_RESPONSE')
  const date = new Date(gmt && !value.endsWith('Z') ? `${value}Z` : value)
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  if (
    !Number.isFinite(date.getTime()) ||
    !Number.isFinite(calendar.getTime()) ||
    calendar.toISOString().slice(0, 10) !== value.slice(0, 10) ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19)) > 59
  )
    return fail('MALFORMED_RESPONSE')
  return date.toISOString()
}
/** Includes DNS, headers and the whole body operation in one abortable deadline. */
export const withSourceDeadline = async <T>(
  ms: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  boundedInteger(ms, 15_000)
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new SourceClientError('TIMEOUT'))
    }, ms)
  })
  try {
    return await Promise.race([run(controller.signal), deadline])
  } catch (error) {
    if (controller.signal.aborted) throw new SourceClientError('TIMEOUT')
    if (error instanceof SourceClientError) throw error
    throw new SourceClientError('NETWORK_ERROR')
  } finally {
    clearTimeout(timer)
  }
}
export const readSourceBytes = async (
  response: Response,
  max: number,
  signal: AbortSignal,
): Promise<Uint8Array> => {
  const length = response.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > max)) {
    void response.body?.cancel().catch(() => {})
    return fail('TOO_LARGE')
  }
  if (!response.body || signal.aborted) {
    void response.body?.cancel().catch(() => {})
    return fail('MALFORMED_RESPONSE')
  }
  const reader = response.body.getReader()
  const cancel = () => {
    void reader.cancel().catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (signal.aborted) return fail('TIMEOUT')
      if (done) break
      total += value.byteLength
      if (total > max) {
        cancel()
        return fail('TOO_LARGE')
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  } finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}
export const fetchSourceText = async (
  url: URL,
  options: SourceClientOptions,
  mime: string,
  max: number,
): Promise<{ text: string; headers: Headers }> =>
  withSourceDeadline(options.timeoutMs ?? 15_000, async (signal) => {
    const response = await (options.fetch ?? globalThis.fetch)(url, {
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      headers: { Accept: mime },
      signal,
    })
    if (signal.aborted) {
      void response.body?.cancel().catch(() => {})
      return fail('TIMEOUT')
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {})
      throw new SourceClientError('HTTP_ERROR', response.status)
    }
    if (
      response.redirected ||
      (response.url && new URL(response.url).origin !== url.origin) ||
      response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== mime
    ) {
      void response.body?.cancel().catch(() => {})
      return fail('MALFORMED_RESPONSE')
    }
    const bytes = await readSourceBytes(response, max, signal)
    try {
      return {
        text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        headers: response.headers,
      }
    } catch {
      return fail('MALFORMED_RESPONSE')
    }
  })

export const decodeSourceEntities = (value: string): string =>
  value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (raw, entity: string) => {
    const names: Record<string, string> = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      nbsp: '\u00a0',
    }
    if (!entity.startsWith('#')) return names[entity.toLowerCase()] ?? raw
    const cp =
      entity[1]?.toLowerCase() === 'x'
        ? Number.parseInt(entity.slice(2), 16)
        : Number(entity.slice(1))
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff)
      ? String.fromCodePoint(cp)
      : '\ufffd'
  })
export interface SourceHtmlNode {
  tag: string
  attrs: Record<string, string>
  start: number
  innerStart: number
  innerEnd: number
  end: number
  parent?: SourceHtmlNode
}
/** Bounded, non-executing scanner with matched nested elements and raw source offsets.
 * Not a browser HTML sanitizer. Provider markup outside this small well-formed subset fails closed. */
export const scanSourceHtml = (html: string): SourceHtmlNode[] => {
  if (Buffer.byteLength(html) > 1_048_576) return fail('TOO_LARGE')
  const nodes: SourceHtmlNode[] = []
  const stack: SourceHtmlNode[] = []
  const tokens = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^<>"']*(?:(?:"[^"]*"|'[^']*')[^<>"']*)*>/g
  const voids = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
  ])
  for (;;) {
    const token = tokens.exec(html)
    if (!token) break
    const raw = token[0]
    if (raw.startsWith('<!')) continue
    const tag = /^<\/?([\w:-]+)/.exec(raw)?.[1]?.toLowerCase()
    if (!tag) continue
    if (raw.startsWith('</')) {
      let index = stack.length - 1
      while (index >= 0 && stack[index]?.tag !== tag) index--
      if (index >= 0) {
        for (const node of stack.splice(index)) {
          node.innerEnd = token.index
          node.end = tokens.lastIndex
        }
      }
      continue
    }
    const attrs: Record<string, string> = Object.create(null)
    const rest = raw.slice(tag.length + 1, -1)
    for (const match of rest.matchAll(
      /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
    )) {
      const key = match[1]?.toLowerCase()
      if (!key) continue
      if (Object.hasOwn(attrs, key)) return fail('MALFORMED_RESPONSE')
      attrs[key] = decodeSourceEntities(match[2] ?? match[3] ?? match[4] ?? '')
    }
    const node: SourceHtmlNode = {
      tag,
      attrs,
      start: token.index,
      innerStart: tokens.lastIndex,
      innerEnd: tokens.lastIndex,
      end: tokens.lastIndex,
      parent: stack.at(-1),
    }
    nodes.push(node)
    if (nodes.length > 50_000 || stack.length > 128) return fail('MALFORMED_RESPONSE')
    if (!voids.has(tag) && !raw.endsWith('/>')) {
      if (tag === 'script' || tag === 'style') {
        const end = new RegExp(`</${tag}\\s*>`, 'ig')
        end.lastIndex = tokens.lastIndex
        const close = end.exec(html)
        if (!close) return fail('MALFORMED_RESPONSE')
        node.innerEnd = close.index
        node.end = end.lastIndex
        tokens.lastIndex = end.lastIndex
      } else stack.push(node)
    }
  }
  for (const node of stack) {
    node.innerEnd = html.length
    node.end = html.length
  }
  return nodes
}
export const hasSourceClass = (node: SourceHtmlNode, name: string): boolean =>
  (node.attrs.class ?? '').split(/\s+/).includes(name)
export const sourceNodeText = (html: string): string =>
  decodeSourceEntities(
    html.replace(/<br\s*\/?\s*>|<\/(?:div|p|li|h[1-6])\s*>/gi, '\n').replace(/<[^>]*>/g, ''),
  )

/** Exact provider-specific media paths. The downloader separately validates DNS and every redirect. */
export const sourceImageUrl = (value: string, source: SourceKind): URL => {
  if (
    value.length > 8_192 ||
    value !== value.trim() ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127 || character === '\\',
    )
  )
    return fail('UNSAFE_URL')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return fail('UNSAFE_URL')
  }
  if (
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !['http:', 'https:'].includes(url.protocol)
  )
    return fail('UNSAFE_URL')
  const host = url.hostname
  const path = url.pathname
  const safePath = !/%(?:2f|5c|2e|00)/i.test(path)
  const allowed =
    safePath &&
    (source === 'telegram'
      ? (/^cdn[0-9]+\.telesco\.pe$/.test(host) && path.startsWith('/file/')) ||
        (/^cdn[0-9]+\.cdn-telegram\.org$/.test(host) && path.startsWith('/file/'))
      : source === 'moneydigest'
        ? (host === 'www.moneydigest.sg' && path.startsWith('/wp-content/uploads/')) ||
          (host === 'i0.wp.com' && path.startsWith('/www.moneydigest.sg/wp-content/uploads/'))
        : (host === 'scoobifydaily.files.wordpress.com' && /^\/\d{4}\/\d{2}\//.test(path)) ||
          (host === 'scoobifydaily.wordpress.com' && path.startsWith('/wp-content/uploads/')) ||
          (host === 'i0.wp.com' &&
            path.startsWith('/scoobifydaily.wordpress.com/wp-content/uploads/')))
  if (
    !allowed ||
    (url.protocol === 'http:' && !(source === 'moneydigest' && host === 'www.moneydigest.sg'))
  )
    return fail('UNSAFE_URL')
  url.protocol = 'https:'
  return url
}
export const extractSourceImages = (
  html: string,
  baseUrl: string,
  source: SourceKind,
): SourcePost['images'] => {
  const result: { url: string; altText?: string }[] = []
  const seen = new Set<string>()
  for (const node of scanSourceHtml(html)) {
    let original: string | undefined
    if (node.tag === 'img' && source === 'telegram') continue // Widget avatars are not promotion photos.
    if (node.tag === 'img') {
      const width = Number(node.attrs['data-orig-size']?.split(',')[0] ?? node.attrs.width)
      const height = Number(node.attrs['data-orig-size']?.split(',')[1] ?? node.attrs.height)
      if (width > 0 && height > 0 && width < 100 && height < 100) continue
      original =
        node.attrs['data-orig-file'] ||
        node.attrs['data-large-file'] ||
        node.attrs['data-src'] ||
        node.attrs.src
    } else if (source === 'telegram' && hasSourceClass(node, 'tgme_widget_message_photo_wrap'))
      original = /background-image\s*:\s*url\(\s*(['"]?)(.*?)\1\s*\)/i.exec(
        node.attrs.style ?? '',
      )?.[2]
    if (!original) continue
    try {
      const value = new URL(original, baseUrl).href
      const checked = sourceImageUrl(value, source)
      if (
        /(?:^|[/_.-])(?:logo|favicon|facebook|twitter|social|icon|pixel|tracking)(?:[/_.-]|$)/i.test(
          checked.pathname,
        ) ||
        seen.has(checked.href)
      )
        continue
      seen.add(checked.href)
      result.push({ url: value, ...(node.attrs.alt ? { altText: node.attrs.alt } : {}) })
      if (result.length === 5) break
    } catch {
      /* Untrusted links are not candidates for fetching. */
    }
  }
  return result
}
