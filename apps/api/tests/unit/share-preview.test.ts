import { previewPage } from '@api/rest/routers/share'
import { describe, expect, it } from 'vitest'

describe('shared deal link preview', () => {
  const page = previewPage({
    title: 'Kopi <b>& toast</b>',
    description: 'Synthetic outlet · Ends 31 Dec 2026 · Only on LoBangers',
    url: 'https://web.example.test/deals/d1?at=v1&x="y"',
    image: 'https://media.example.test/kopi.jpg',
    imageAlt: 'Two kopi',
  })

  it('gives chat apps the picture, name and details as Open Graph tags', () => {
    expect(page).toContain(
      '<meta property="og:image" content="https://media.example.test/kopi.jpg" />',
    )
    expect(page).toContain(
      '<meta property="og:title" content="Kopi &#60;b&#62;&#38; toast&#60;/b&#62;" />',
    )
    expect(page).toContain(
      '<meta property="og:description" content="Synthetic outlet · Ends 31 Dec 2026 · Only on LoBangers" />',
    )
    expect(page).toContain('<meta name="twitter:card" content="summary_large_image" />')
  })

  it('escapes deal text and sends people on to the deal page', () => {
    expect(page).not.toContain('<b>')
    expect(page).toContain('url=https://web.example.test/deals/d1?at=v1&#38;x=&#34;y&#34;')
  })
})
