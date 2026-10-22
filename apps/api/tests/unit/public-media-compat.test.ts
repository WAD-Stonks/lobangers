import { imagesFor } from '@api/modules/deals/deal-images'
import { publicImportedImage, publicImportedImageSelect } from '@api/modules/deals/public-images'
import { describe, expect, it } from 'vitest'

const link = (
  hostedUrl: string,
  mimeType = 'image/jpeg',
  sourceUrl = 'http://source.example.test/poster.jpg',
) => ({
  sourceUrl,
  finalUrl: null,
  altText: '  Synthetic poster  ',
  image: { status: 'HOSTED', hostedUrl, mimeType },
})
const source = (images: ReturnType<typeof link>[], rawContent = '{}') => ({
  images,
  importedPost: { rawContent },
})

describe('merged public media contract', () => {
  it.each([
    ['https://user:secret@media.example.test/poster.jpg', 'image/jpeg'],
    ['https://media.example.test/not-an-image', 'text/html'],
    ['https://media.example.test/vector.svg', 'image/svg+xml'],
    ['http://media.example.test/poster.jpg', 'image/jpeg'],
    ['javascript:alert(1)', 'image/jpeg'],
  ])('filters unsafe gallery and legacy URLs: %s / %s', (url, mime) => {
    const deal = { sources: [source([link(url, mime)])] }
    expect(imagesFor(deal)).toEqual([])
    expect(publicImportedImage(deal)).toEqual({ imageUrl: null })
  })

  it('keeps archive GIFs and literal HTTP provenance with nullable historical finalUrl', () => {
    const original = link('https://media.example.test/archive.gif', 'image/gif')
    const before = structuredClone(original)
    const deal = { sources: [source([original])] }
    expect(imagesFor(deal)).toEqual([{ url: original.image.hostedUrl, alt: 'Synthetic poster' }])
    expect(publicImportedImage(deal)).toEqual({
      imageUrl: original.image.hostedUrl,
      imageAltText: 'Synthetic poster',
    })
    expect(original).toEqual(before)
  })

  it('selects the same article hero for gallery and legacy thumbnails', () => {
    const shelf = link(
      'https://media.example.test/shelf.jpg',
      'image/jpeg',
      'http://source.example.test/shelf.jpg',
    )
    const hero = link(
      'https://media.example.test/hero.jpg',
      'image/jpeg',
      'http://source.example.test/hero.jpg',
    )
    const deal = {
      sources: [
        source(
          [shelf, hero],
          '<p><img src="http://source.example.test/hero.jpg"><img src="http://source.example.test/shelf.jpg"></p>',
        ),
      ],
    }
    expect(imagesFor(deal)).toEqual([{ url: hero.image.hostedUrl, alt: 'Synthetic poster' }])
    expect(publicImportedImage(deal).imageUrl).toBe(hero.image.hostedUrl)
  })

  it('bounds source and image populations before selecting public media', () => {
    const unsafe = Array.from({ length: 5 }, () => link('http://media.example.test/unsafe.jpg'))
    const sixthImage = {
      sources: [source([...unsafe, link('https://media.example.test/sixth.jpg')])],
    }
    const sixthSource = {
      sources: [
        ...Array.from({ length: 5 }, () => source(unsafe)),
        source([link('https://media.example.test/sixth-source.jpg')]),
      ],
    }
    for (const deal of [sixthImage, sixthSource]) {
      expect(imagesFor(deal)).toEqual([])
      expect(publicImportedImage(deal)).toEqual({ imageUrl: null })
    }
    expect(publicImportedImageSelect.take).toBe(5)
    expect(publicImportedImageSelect.select.images.take).toBe(5)
  })
})
