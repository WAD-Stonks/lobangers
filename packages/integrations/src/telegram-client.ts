import {
  boundedInteger,
  extractSourceImages,
  fail,
  fetchSourceText,
  hasSourceClass,
  parseSourceDate,
  type SourceClient,
  type SourceClientOptions,
  type SourceHtmlNode,
  type SourcePost,
  scanSourceHtml,
  sourceNodeText,
  validateList,
} from '@integrations/ingestion-source-post'

export interface TelegramClientOptions extends SourceClientOptions {
  previewUrl?: string
}
/** This is URL syntax validation, not username registration/availability validation.
 * Telegram documents basic names as 5–32 but also supports shorter collectibles.
 * Do not invent a collectible minimum: accept a nonempty bounded ASCII candidate;
 * the same-identity active preview marker and widget IDs then prove provider identity.
 * Registry identity is lowercase; returned post IDs retain literal data-post casing.
 * References: https://core.telegram.org/method/account.checkUsername
 * https://core.telegram.org/api/fragment and https://telegram.org/faq#q-what-can-i-use-as-my-username */
export const parseTelegramPreviewUrl = (
  value: string,
): { previewUrl: string; username: string; sourceExternalId: string } => {
  if (typeof value !== 'string') return fail('INVALID_INPUT')
  const match = /^https:\/\/t\.me\/s\/([A-Za-z0-9_]{1,32})$/.exec(value)
  const username = match?.[1]
  if (
    !username ||
    [
      'c',
      's',
      'joinchat',
      'share',
      'proxy',
      'socks',
      'login',
      'contact',
      'invoice',
      'boost',
      'iv',
      'addstickers',
      'addemoji',
      'addlist',
      'setlanguage',
      'bg',
      'giftcode',
      'stars',
      'confirmphone',
    ].includes(username.toLowerCase())
  )
    return fail('INVALID_INPUT')
  return { previewUrl: value, username, sourceExternalId: username.toLowerCase() }
}

/** Public preview only, configured by the persisted source registry, not environment.
 * Default exists for backward compatibility only; production must pass previewUrl.
 * page > 1 requires the previous literal message-ID cursor; callers scope it per source. */
export const createTelegramClient = (options: TelegramClientOptions = {}): SourceClient => {
  boundedInteger(options.timeoutMs ?? 15_000, 15_000)
  const identity = parseTelegramPreviewUrl(options.previewUrl ?? 'https://t.me/s/ThisCounted')
  return {
    listPosts: async (input) => {
      validateList(input)
      const cursor = input.cursor ?? null
      if (
        (input.page === 1 && cursor !== null) ||
        (input.page > 1 && cursor === null) ||
        (cursor !== null &&
          (typeof cursor !== 'string' ||
            !/^[1-9]\d{0,14}$/.test(cursor) ||
            !Number.isSafeInteger(Number(cursor))))
      )
        return fail('INVALID_INPUT')
      const url = new URL(identity.previewUrl)
      if (cursor !== null) url.searchParams.set('before', cursor)
      const { text: html } = await fetchSourceText(url, options, 'text/html', 500_000)
      const nodes = scanSourceHtml(html)
      if (
        !nodes.some(
          (node) =>
            hasSourceClass(node, 'tgme_channel_info_header_username') &&
            sourceNodeText(html.slice(node.innerStart, node.innerEnd)).trim().toLowerCase() ===
              `@${identity.sourceExternalId}` &&
            (!node.attrs.href ||
              node.attrs.href.toLowerCase() === `https://t.me/${identity.sourceExternalId}`),
        )
      )
        return fail('MALFORMED_RESPONSE')
      const messages = nodes.filter((node) => hasSourceClass(node, 'tgme_widget_message'))
      if (messages.length > 20) return fail('MALFORMED_RESPONSE')
      const seen = new Set<string>()
      const posts: SourcePost[] = messages.map((message) => {
        const id = message.attrs['data-post'] ?? ''
        if (
          !/^[A-Za-z0-9_]{1,32}\/[1-9]\d{0,14}$/.test(id) ||
          id.split('/')[0]?.toLowerCase() !== identity.sourceExternalId ||
          !Number.isSafeInteger(Number(id.split('/')[1])) ||
          seen.has(id.toLowerCase())
        )
          return fail('MALFORMED_RESPONSE')
        const numericId = Number(id.split('/')[1])
        if (cursor !== null && numericId >= Number(cursor)) return fail('MALFORMED_RESPONSE')
        seen.add(id.toLowerCase())
        const belongs = (node: SourceHtmlNode): boolean => {
          let parent = node.parent
          while (parent) {
            if (parent === message) return true
            parent = parent.parent
          }
          return false
        }
        const descendants = nodes.filter(belongs)
        const content = descendants.find((node) => hasSourceClass(node, 'tgme_widget_message_text'))
        const dateLink = descendants.find((node) =>
          hasSourceClass(node, 'tgme_widget_message_date'),
        )
        const time = descendants.find((node) => node.tag === 'time' && node.parent === dateLink)
        if (
          !dateLink ||
          dateLink.attrs.href?.toLowerCase() !== `https://t.me/${id}`.toLowerCase() ||
          !time?.attrs.datetime
        )
          return fail('MALFORMED_RESPONSE')
        const contentHtml = content ? html.slice(content.innerStart, content.innerEnd) : ''
        const title = sourceNodeText(contentHtml).split('\n')[0] ?? ''
        return {
          externalId: id,
          url: `https://t.me/${id}`,
          publishedAt: parseSourceDate(time.attrs.datetime),
          sourceUpdatedAt: null,
          title,
          contentHtml,
          excerptHtml: '',
          images: extractSourceImages(html.slice(message.start, message.end), url.href, 'telegram'),
        }
      })
      posts.sort((a, b) => Number(b.externalId.split('/')[1]) - Number(a.externalId.split('/')[1]))
      const selected = posts.slice(0, input.perPage)
      return { posts: selected, nextCursor: selected.at(-1)?.externalId.split('/')[1] ?? null }
    },
  }
}
