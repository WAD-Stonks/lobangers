import { mount } from '@vue/test-utils'
import DealGallery from '@web/modules/browse-map/DealGallery.vue'
import DealPhoto from '@web/modules/browse-map/DealPhoto.vue'
import { describe, expect, it } from 'vitest'

const URL_A = 'https://media.example.test/a.jpg'
const URL_B = 'https://media.example.test/b.jpg'

describe('current map media safety', () => {
  it.each([
    'http://media.example.test/insecure.jpg',
    'https://user:secret@media.example.test/a.jpg',
    'javascript:alert(1)',
  ])('never renders an unsafe photo src: %s', (src) => {
    const wrapper = mount(DealPhoto, { props: { src, alt: 'Synthetic poster' } })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.emitted('error')).toHaveLength(1)
    wrapper.unmount()
  })

  it('resets loading for a new URL and ignores detached image events', async () => {
    const wrapper = mount(DealPhoto, { props: { src: URL_A, alt: 'Synthetic A' } })
    const previous = wrapper.get('img')
    Object.defineProperty(previous.element, 'naturalWidth', { value: 800 })
    Object.defineProperty(previous.element, 'naturalHeight', { value: 400 })
    await previous.trigger('load')
    expect(wrapper.classes()).not.toContain('is-loading')
    await wrapper.setProps({ src: URL_B, alt: 'Synthetic B' })
    expect(wrapper.classes()).toContain('is-loading')
    expect(wrapper.get('img').element).not.toBe(previous.element)
    await previous.trigger('error')
    await previous.trigger('load')
    expect(wrapper.emitted('error')).toBeUndefined()
    expect(wrapper.emitted('ratio')).toHaveLength(1)
    expect(wrapper.get('img').attributes('src')).toBe(URL_B)
    expect(wrapper.get('img').attributes('referrerpolicy')).toBe('no-referrer')
    await wrapper.get('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.emitted('error')).toHaveLength(1)
    await wrapper.setProps({ src: URL_A })
    expect(wrapper.get('img').attributes('src')).toBe(URL_A)
    wrapper.unmount()
  })

  it('filters unsafe gallery entries, deduplicates and keeps the bounded upstream gallery', async () => {
    const images = [
      { url: 'https://user:secret@media.example.test/private.jpg', alt: null },
      { url: 'javascript:alert(1)', alt: null },
      { url: URL_A, alt: '   ' },
      { url: URL_A, alt: 'Duplicate' },
      ...Array.from({ length: 8 }, (_, i) => ({
        url: `https://media.example.test/${i}.jpg`,
        alt: null,
      })),
    ]
    const wrapper = mount(DealGallery, {
      props: { images, title: 'Synthetic offer' },
      slots: { fallback: '<span data-testid="fallback">No photo</span>' },
    })
    expect(wrapper.findAll('img')).toHaveLength(6)
    expect(wrapper.get('img').attributes('alt')).toBe('Synthetic offer, photo 1')
    for (const img of wrapper.findAll('img'))
      expect(img.attributes('referrerpolicy')).toBe('no-referrer')
    await wrapper.setProps({ images: images.slice(0, 2) })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('[data-testid="fallback"]').exists()).toBe(true)
    expect(wrapper.emitted('showing')?.at(-1)).toEqual([false])
    wrapper.unmount()
  })
})
