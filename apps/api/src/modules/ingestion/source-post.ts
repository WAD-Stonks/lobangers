import { parseMoneyDigestPost, parsePostContent } from '@api/modules/ingestion/parser'
import type { SourceDefinition } from '@api/modules/ingestion/source'
import { extractSourceImages } from '@broke-oclock/integrations/server'
import { z } from 'zod'

const sourcePostSchema = z.strictObject({
  externalId: z.string().regex(/^(?:[A-Za-z0-9_]{1,32}\/)?[1-9]\d{0,14}$/),
  url: z.url().max(2048),
  publishedAt: z.string().max(64).nullable(),
  sourceUpdatedAt: z.string().max(64).nullable(),
  title: z.string().max(2000),
  contentHtml: z.string().max(100_000),
  excerptHtml: z.string().max(10_000),
  images: z
    .array(z.strictObject({ url: z.url().max(8192), altText: z.string().max(500).optional() }))
    .max(5),
})
export const parseSourceIdentity = (input: unknown, source: SourceDefinition) => {
  const value = z
    .object({ externalId: sourcePostSchema.shape.externalId, url: sourcePostSchema.shape.url })
    .parse(input)
  const url = new URL(value.url)
  const supported =
    source.kind === 'telegram'
      ? url.origin === 'https://t.me' &&
        url.pathname.toLowerCase() ===
          (value.externalId.includes('/')
            ? `/${value.externalId}`
            : `/${new URL(source.url).pathname.split('/').at(-1)}/${value.externalId}`
          ).toLowerCase() &&
        (!value.externalId.includes('/') ||
          value.externalId.split('/')[0]?.toLowerCase() === source.externalId.toLowerCase()) &&
        !url.search &&
        !url.hash
      : !value.externalId.includes('/') && url.origin === new URL(source.url).origin
  if (!supported || url.username || url.password || /[\s\\]/u.test(value.url))
    throw new z.ZodError([{ code: 'custom', path: ['url'], message: 'Unsupported source URL' }])
  return { id: value.externalId, link: value.url }
}
export type SourcePost = z.infer<typeof sourcePostSchema>
export const parseSourcePost = (input: unknown, source: SourceDefinition) => {
  // Legacy MoneyDigest callers retain their exact post snapshot and hash contract.
  if (source.kind === 'moneydigest' && typeof input === 'object' && input && 'id' in input) {
    const parsed = parseMoneyDigestPost(input)
    return {
      ...parsed,
      snapshot: parsed.post,
      images: [
        ...extractSourceImages(parsed.post.content.rendered, parsed.post.link, 'moneydigest'),
      ],
    }
  }
  const value = sourcePostSchema.parse(input)
  parseSourceIdentity(value, source)
  const content = {
    title: { rendered: value.title },
    content: { rendered: value.contentHtml },
    excerpt: { rendered: value.excerptHtml },
  }
  return {
    ...parsePostContent(content),
    post: { ...content, id: value.externalId, link: value.url, date: value.publishedAt },
    snapshot: value,
    images: value.images,
  }
}
