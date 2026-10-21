import { imagesFor, MAX_DEAL_IMAGES } from '@api/modules/deals/deal-images'
import { dealImageSchema } from '@broke-oclock/contracts/deals'
import { describe, expect, it } from 'vitest'

const UPLOADS = 'https://www.moneydigest.sg/wp-content/uploads/2026/09'
const hostedUrl = (key: string) => `https://a2rucyxaq8.ufs.sh/f/${key}`

type Row = {
  sourceUrl: string
  altText: string | null
  image: { status: string; hostedUrl: string | null } | null
}

const row = (
  key: string,
  sourceUrl = `https://cdn5.telesco.pe/file/${key}.jpg`,
  altText: string | null = null,
): Row => ({
  sourceUrl,
  altText,
  image: { status: 'HOSTED', hostedUrl: hostedUrl(key) },
})

const article = (html: string, images: Row[]) => ({
  importedPost: { rawContent: html },
  images,
})

const telegram = (images: Row[]) => ({
  importedPost: { rawContent: '{"hashScope":"projected-factual-evidence"}' },
  images,
})

const ARTICLE_HTML = [
  `<p><a href="https://t.me/moneydigest"><img src="${UPLOADS}/telegram.png" width="349" height="97"></a></p>`,
  '<p>Intro text.</p>',
  `<img class="wp-image-1" src="${UPLOADS}/laoganma-scaled.jpeg" width="500" height="667">`,
  `<p>The range:</p><img src="${UPLOADS}/Screenshot-2026-09-27-at-12.19.58%20PM.png">`,
  `<p>Spotted in store.</p><img src="${UPLOADS}/shelf-photo-1024x768.jpg">`,
].join('')

describe('deal images', () => {
  it('keeps only the hero of an article: its first content image, in page order', () => {
    const images = imagesFor({
      sources: [
        // Stored order differs from page order, as it does in the real import.
        article(ARTICLE_HTML, [
          row('shelf', `${UPLOADS}/shelf-photo.jpg`),
          row('hero', `${UPLOADS}/laoganma-scaled.jpeg`, 'Lao Gan Ma chips'),
          row('table', `${UPLOADS}/Screenshot-2026-09-27-at-12.19.58 PM.png`),
        ]),
      ],
    })
    expect(images).toEqual([{ url: hostedUrl('hero'), alt: 'Lao Gan Ma chips' }])
    for (const image of images) expect(dealImageSchema.parse(image)).toEqual(image)
  })

  it('never picks a screenshot or the channel banner as an article hero', () => {
    const html = `<img src="${UPLOADS}/Screenshot-1.png"><img src="${UPLOADS}/poster.jpg">`
    const images = imagesFor({
      sources: [
        article(html, [
          row('shot', `${UPLOADS}/Screenshot-1.png`),
          row('poster', `${UPLOADS}/poster.jpg`),
        ]),
      ],
    })
    expect(images.map((image) => image.url)).toEqual([hostedUrl('poster')])
  })

  it('falls back to the first stored image when the article HTML does not mention any', () => {
    const images = imagesFor({
      sources: [
        article('<p>No images inline.</p>', [
          row('a', `${UPLOADS}/a.jpg`),
          row('b', `${UPLOADS}/b.jpg`),
        ]),
      ],
    })
    expect(images.map((image) => image.url)).toEqual([hostedUrl('a')])
  })

  it("keeps every photo of a Telegram post, in stored order, since they are the post's own", () => {
    const images = imagesFor({ sources: [telegram([row('t1'), row('t2'), row('t3')])] })
    expect(images.map((image) => image.url)).toEqual([
      hostedUrl('t1'),
      hostedUrl('t2'),
      hostedUrl('t3'),
    ])
  })

  it('drops images that are not hosted, have no URL, or are not https', () => {
    const images = imagesFor({
      sources: [
        telegram([
          { ...row('p'), image: { status: 'PENDING', hostedUrl: hostedUrl('p') } },
          { ...row('n'), image: { status: 'HOSTED', hostedUrl: null } },
          { ...row('h'), image: { status: 'HOSTED', hostedUrl: 'http://example.com/x.jpg' } },
          { ...row('x'), image: null },
          row('ok'),
        ]),
      ],
    })
    expect(images).toEqual([{ url: hostedUrl('ok'), alt: null }])
  })

  it('removes duplicates shared by two sources and caps the gallery', () => {
    const many = Array.from({ length: MAX_DEAL_IMAGES + 4 }, (_, index) => row(`k${index}`))
    const images = imagesFor({ sources: [telegram([row('k0'), ...many]), telegram([row('k1')])] })
    expect(images).toHaveLength(MAX_DEAL_IMAGES)
    expect(new Set(images.map((image) => image.url)).size).toBe(MAX_DEAL_IMAGES)
  })
})
