import { mount } from '@vue/test-utils'
import DealGallery from '@web/modules/browse-map/DealGallery.vue'
import { describe, expect, it } from 'vitest'

const FALLBACK = { fallback: '<span data-testid="fallback">icon</span>' }
const image = (key: string, alt: string | null = null) => ({
  url: `https://a2rucyxaq8.ufs.sh/f/${key}`,
  alt,
})

const mountGallery = (images: ReturnType<typeof image>[]) =>
  mount(DealGallery, { props: { images, title: 'Kopi' }, slots: FALLBACK })

// jsdom never decodes images, so report a size the way a real load event would.
const loadWithSize = async (
  wrapper: ReturnType<typeof mountGallery>,
  index: number,
  width: number,
  height: number,
) => {
  const img = wrapper.findAll('img')[index]
  if (!img) throw new Error(`no image at ${index}`)
  Object.defineProperty(img.element, 'naturalWidth', { value: width })
  Object.defineProperty(img.element, 'naturalHeight', { value: height })
  await img.trigger('load')
}

const frameRatio = (wrapper: ReturnType<typeof mountGallery>) =>
  Number(
    (wrapper.get('[data-testid="deal-gallery"]').element as HTMLElement).style.getPropertyValue(
      '--frame-ratio',
    ),
  )

describe('DealGallery', () => {
  it('shows the fallback when the deal has no photos, and says so', () => {
    const wrapper = mountGallery([])
    expect(wrapper.find('[data-testid="deal-gallery"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="fallback"]').exists()).toBe(true)
    expect(wrapper.emitted('showing')?.at(-1)).toEqual([false])
  })

  it('renders every photo with alt text and a counter', () => {
    const wrapper = mountGallery([image('a', 'Poster'), image('b')])
    const imgs = wrapper.findAll('img')
    expect(imgs.map((img) => img.attributes('alt'))).toEqual(['Poster', 'Kopi, photo 2'])
    expect(imgs[0]?.attributes('loading')).toBe('eager')
    expect(imgs[1]?.attributes('loading')).toBe('lazy')
    expect(wrapper.find('.deal-gallery__count').text()).toBe('1/2')
    expect(wrapper.emitted('showing')?.at(-1)).toEqual([true])
  })

  it('shapes the frame to the photo, within portrait and landscape limits', async () => {
    const wrapper = mountGallery([image('poster')])
    expect(frameRatio(wrapper)).toBeCloseTo(4 / 3)
    await loadWithSize(wrapper, 0, 1080, 1350)
    expect(frameRatio(wrapper)).toBeCloseTo(0.8)

    const tall = mountGallery([image('tall')])
    await loadWithSize(tall, 0, 400, 2000)
    expect(frameRatio(tall)).toBeCloseTo(3 / 5)

    const wide = mountGallery([image('wide')])
    await loadWithSize(wide, 0, 1504, 428)
    expect(frameRatio(wide)).toBeCloseTo(2)
  })

  it('steps through photos with the arrows and follows the active photo shape', async () => {
    const wrapper = mountGallery([image('square'), image('landscape')])
    await loadWithSize(wrapper, 0, 800, 800)
    await loadWithSize(wrapper, 1, 1600, 900)
    const prev = wrapper.get('[data-testid="gallery-prev"]')
    const next = wrapper.get('[data-testid="gallery-next"]')
    expect(prev.attributes('disabled')).toBeDefined()
    expect(frameRatio(wrapper)).toBeCloseTo(1)

    await next.trigger('click')
    expect(wrapper.find('.deal-gallery__count').text()).toBe('2/2')
    expect(next.attributes('disabled')).toBeDefined()
    expect(prev.attributes('disabled')).toBeUndefined()
    expect(frameRatio(wrapper)).toBeCloseTo(16 / 9)

    await prev.trigger('click')
    expect(wrapper.find('.deal-gallery__count').text()).toBe('1/2')
  })

  it('has no arrows for a single photo', () => {
    const wrapper = mountGallery([image('only')])
    expect(wrapper.find('[data-testid="gallery-next"]').exists()).toBe(false)
  })

  it('drops photos that fail to load and falls back once none are left', async () => {
    const wrapper = mountGallery([image('a'), image('b')])
    await wrapper.findAll('img')[0]?.trigger('error')
    expect(wrapper.findAll('img')).toHaveLength(1)
    expect(wrapper.find('.deal-gallery__count').exists()).toBe(false)
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('[data-testid="fallback"]').exists()).toBe(true)
    expect(wrapper.emitted('showing')?.at(-1)).toEqual([false])
  })
})

describe('DealGallery photo viewer', () => {
  const viewerImage = (wrapper: ReturnType<typeof mountGallery>) =>
    wrapper.find('[data-testid="photo-viewer"] img')

  it('opens the tapped photo full size and steps through the others', async () => {
    const wrapper = mountGallery([image('one', 'Front'), image('two', 'Back')])
    expect(viewerImage(wrapper).exists()).toBe(false)
    await wrapper.findAll('[data-testid="open-photo"]')[1]?.trigger('click')
    expect(viewerImage(wrapper).attributes('alt')).toBe('Back')
    await wrapper.get('[data-testid="viewer-next"]').trigger('click')
    expect(viewerImage(wrapper).attributes('alt')).toBe('Front')
    await wrapper.get('[data-testid="photo-viewer"]').trigger('keydown', { key: 'ArrowLeft' })
    expect(viewerImage(wrapper).attributes('alt')).toBe('Back')
  })

  it('clears the photo when the dialog closes by button, Escape or backdrop', async () => {
    const wrapper = mountGallery([image('one', 'Front')])
    await wrapper.get('[data-testid="open-photo"]').trigger('click')
    expect(wrapper.find('[data-testid="viewer-next"]').exists()).toBe(false)
    await wrapper.get('[data-testid="photo-viewer"]').trigger('close')
    expect(viewerImage(wrapper).exists()).toBe(false)
  })
})
