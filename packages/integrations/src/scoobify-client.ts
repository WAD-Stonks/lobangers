import {
  boundedInteger,
  extractSourceImages,
  fail,
  fetchSourceText,
  parseSourceDate,
  type SourceClient,
  type SourceClientOptions,
  type SourcePost,
  validateList,
} from '@integrations/ingestion-source-post'
import { withProviderEnvelope } from '@integrations/provider-envelope'

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const rendered = (value: unknown): string =>
  record(value) && typeof value.rendered === 'string' ? value.rendered : fail('MALFORMED_RESPONSE')
export const normalizeScoobifyPost = (value: unknown): SourcePost => {
  if (
    !record(value) ||
    'code' in value ||
    typeof value.id !== 'number' ||
    !Number.isSafeInteger(value.id) ||
    value.id < 1 ||
    typeof value.link !== 'string' ||
    value.link !== value.link.trim() ||
    Array.from(value.link).some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127 || character === '\\',
    )
  )
    return fail('MALFORMED_RESPONSE')
  let url: URL
  try {
    url = new URL(value.link)
  } catch {
    return fail('MALFORMED_RESPONSE')
  }
  if (
    url.origin !== 'https://scoobifydaily.wordpress.com' ||
    url.username ||
    url.password ||
    url.hash
  )
    return fail('MALFORMED_RESPONSE')
  const contentHtml = rendered(value.content)
  return withProviderEnvelope(
    {
      externalId: String(value.id),
      url: value.link,
      publishedAt: parseSourceDate(value.date_gmt, true),
      sourceUpdatedAt: parseSourceDate(value.modified_gmt, true),
      title: rendered(value.title),
      contentHtml,
      excerptHtml: value.excerpt === undefined ? '' : rendered(value.excerpt),
      images: extractSourceImages(contentHtml, url.href, 'scoobify'),
    },
    value,
  )
}
/** WordPress.com public v2 endpoint, fixed site, <=20 posts and <=1MiB JSON.
 * date_gmt/modified_gmt are authoritative; local date without GMT is deliberately null. */
export const createScoobifyClient = (options: SourceClientOptions = {}): SourceClient => {
  boundedInteger(options.timeoutMs ?? 15_000, 15_000)
  return {
    listPosts: async (input) => {
      validateList(input)
      if (
        input.cursor != null &&
        (typeof input.cursor !== 'string' || input.cursor !== String(input.page))
      )
        return fail('INVALID_INPUT')
      const url = new URL(
        'https://public-api.wordpress.com/wp/v2/sites/scoobifydaily.wordpress.com/posts',
      )
      url.search = new URLSearchParams({
        page: String(input.page),
        per_page: String(input.perPage),
        order: 'desc',
        orderby: 'date',
        _fields: 'id,link,date_gmt,modified_gmt,title,content,excerpt',
      }).toString()
      const { text, headers } = await fetchSourceText(url, options, 'application/json', 1_048_576)
      let payload: unknown
      try {
        payload = JSON.parse(text)
      } catch {
        return fail('MALFORMED_RESPONSE')
      }
      if (!Array.isArray(payload) || payload.length > input.perPage)
        return fail('MALFORMED_RESPONSE')
      const posts = payload.map(normalizeScoobifyPost)
      if (new Set(posts.map((post) => post.externalId)).size !== posts.length)
        return fail('MALFORMED_RESPONSE')
      const pages = headers.get('x-wp-totalpages')
      if (pages !== null && !/^\d+$/.test(pages)) return fail('MALFORMED_RESPONSE')
      return {
        posts,
        nextCursor:
          posts.length === input.perPage && (pages === null || input.page < Number(pages))
            ? String(input.page + 1)
            : null,
      }
    },
  }
}
