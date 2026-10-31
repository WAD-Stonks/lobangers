import { createHash } from 'node:crypto'
import type { parseSourcePost } from '@api/modules/ingestion/source-post'

// Deliberately conservative, exact-evidence deduplication, not brand/similarity NLP.
// Full fields (not display-truncated description) retain all outlet, membership,
// quantity and price qualifications. Unknown scopes/windows never auto-merge.
export const promotionIdentity = (parsed: ReturnType<typeof parseSourcePost>) => {
  const draft = parsed.draft
  if (!draft?.validFrom || !draft.validUntil || draft.validFrom >= draft.validUntil) return null
  if (draft.offerType === 'FIXED_PRICE' && draft.priceMinor === null) return null
  if (draft.offerType === 'PERCENT_OFF' && draft.discountPercent === null) return null
  // Opaque redemption terms (including case and whitespace) are evidence, not prose to normalize.
  const title = parsed.post.title.rendered
  const content = parsed.post.content.rendered
  const excerpt = parsed.post.excerpt.rendered
  const full = `${title} ${content} ${excerpt}`
  if (!/\b(?:all outlets|selected outlets|online only)\b/iu.test(full)) return null
  if (
    !/\b(?:no membership required|members only|membership required|everyone eligible)\b/iu.test(
      full,
    )
  )
    return null
  return createHash('sha256')
    .update(
      JSON.stringify({
        version: 2,
        title,
        content,
        excerpt,
        offerType: draft.offerType,
        priceMinor: draft.priceMinor,
        discountPercent: draft.discountPercent,
        from: draft.validFrom.toISOString(),
        until: draft.validUntil.toISOString(),
        applicability: draft.applicability,
      }),
    )
    .digest('hex')
}
