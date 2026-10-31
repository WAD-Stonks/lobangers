import { mount, RouterLinkStub } from '@vue/test-utils'
import DealCard from '@web/modules/browse-map/DealCard.vue'
import DealPhoto from '@web/modules/browse-map/DealPhoto.vue'
import { columnsFor, dealColumns } from '@web/modules/browse-map/deal-columns'
import { KOPI_VENUE, makeDeal } from '@web-tests/support/shell-fixtures'
import { describe, expect, it } from 'vitest'

const URL_A = 'https://a2rucyxaq8.ufs.sh/f/a'

// jsdom never decodes images, so report a size the way a real load event would.
const loadImg = async (
  img: ReturnType<ReturnType<typeof mount>['get']>,
  width: number,
  height: number,
) => {
  Object.defineProperty(img.element, 'naturalWidth', { value: width })
  Object.defineProperty(img.element, 'naturalHeight', { value: height })
  await img.trigger('load')
}

describe('DealPhoto', () => {
  it('shimmers until the image loads, then reports its shape', async () => {
    const wrapper = mount(DealPhoto, { props: { src: URL_A, alt: 'Poster' } })
    expect(wrapper.classes()).toContain('is-loading')
    expect(wrapper.attributes('aria-busy')).toBe('true')
    await loadImg(wrapper.get('img'), 1080, 1350)
    expect(wrapper.classes()).not.toContain('is-loading')
    expect(wrapper.attributes('aria-busy')).toBeUndefined()
    expect(wrapper.emitted('ratio')?.[0]).toEqual([0.8])
  })

  it('reports a failed image so the parent can fall back', async () => {
    const wrapper = mount(DealPhoto, { props: { src: URL_A, alt: 'Poster' } })
    await wrapper.get('img').trigger('error')
    expect(wrapper.emitted('error')).toHaveLength(1)
  })
})

const row = (images: { url: string; alt: string | null }[], outletCount = 1) => {
  const deal = makeDeal({ images })
  return {
    key: `${deal.id}:${KOPI_VENUE.id}`,
    deal,
    venue: { ...KOPI_VENUE, deals: [deal] },
    distanceMetres: 400,
    outletCount,
  }
}

const mountCard = (images: { url: string; alt: string | null }[], outletCount = 1) =>
  mount(DealCard, {
    props: { row: row(images, outletCount) as never, to: '/deals/x' },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })

describe('DealCard', () => {
  it('names the other outlets only for a multi-outlet deal', () => {
    expect(mountCard([]).find('[data-testid="more-outlets"]').exists()).toBe(false)
    expect(mountCard([], 3).get('[data-testid="more-outlets"]').text()).toBe('+2 more outlets')
  })

  it('shows the photo at its own shape once loaded', async () => {
    const wrapper = mountCard([{ url: URL_A, alt: null }])
    const top = wrapper.get('.deal-cards__top')
    expect(top.classes()).toContain('deal-cards__top--photo')
    await loadImg(wrapper.get('img'), 800, 1200)
    expect(
      Number((top.element as HTMLElement).style.getPropertyValue('--photo-ratio')),
    ).toBeCloseTo(2 / 3)
  })

  it('keeps the tinted ticket top when there is no photo, or it fails', async () => {
    expect(mountCard([]).find('img').exists()).toBe(false)
    const failing = mountCard([{ url: URL_A, alt: null }])
    await failing.get('img').trigger('error')
    expect(failing.find('img').exists()).toBe(false)
    expect(failing.get('.deal-cards__top').classes()).not.toContain('deal-cards__top--photo')
  })
})

describe('deal columns', () => {
  it('fits as many columns as the width allows, at least one', () => {
    expect(columnsFor(0)).toBe(1)
    expect(columnsFor(300)).toBe(1)
    expect(columnsFor(700)).toBe(3)
  })

  it('deals cards out left to right so reading order stays nearest-first', () => {
    expect(dealColumns(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([
      ['a', 'c', 'e'],
      ['b', 'd'],
    ])
    expect(dealColumns(['a'], 3)).toEqual([['a'], [], []])
  })
})
