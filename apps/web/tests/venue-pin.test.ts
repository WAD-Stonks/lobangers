import { DEAL_PIN_CLASS, DEAL_PIN_LABEL_MAX_CHARS } from '@web/modules/browse-map/map-config'
import {
  createVenuePinIcon,
  pinBadgeText,
  pinFlag,
  pinLabel,
  pinTag,
} from '@web/modules/browse-map/venue-pin'
import { describe, expect, it } from 'vitest'

describe('pinLabel', () => {
  it('prefers the short label and falls back to the title', () => {
    expect(pinLabel({ title: 'Kopi set', label: '$4.50' })).toBe('$4.50')
    expect(pinLabel({ title: 'Kopi set', label: '' })).toBe('Kopi set')
    expect(pinLabel({ title: '  1-for-1  ', label: '  1-for-1  ' })).toBe('1-for-1')
  })

  it('clips long text so a badge never becomes a banner', () => {
    const long = 'Half-price chicken rice all afternoon'
    const label = pinLabel({ title: long, label: long })

    expect(label.length).toBe(DEAL_PIN_LABEL_MAX_CHARS)
    expect(label.endsWith('…')).toBe(true)
    expect(long.startsWith(label.slice(0, -1).trimEnd())).toBe(true)
  })
})

const offer = (overrides: Record<string, unknown>) =>
  ({
    title: 'Kopi',
    label: '$1',
    offerType: 'FIXED_PRICE',
    priceMinor: 100,
    discountPercent: null,
    ...overrides,
  }) as never

describe('pinBadgeText', () => {
  it('shows the price for one deal', () => {
    expect(pinBadgeText([offer({})])).toBe('$1')
  })

  it('shows the cheapest price for several, or a count when none has a price', () => {
    expect(
      pinBadgeText([
        offer({ label: '$2', priceMinor: 200 }),
        offer({ label: '$1.50', priceMinor: 150 }),
      ]),
    ).toBe('from $1.50')
    expect(
      pinBadgeText([
        offer({ label: '1-for-1', priceMinor: null }),
        offer({ label: 'Free kopi', priceMinor: null }),
      ]),
    ).toBe('2 deals')
  })
})

describe('pinTag', () => {
  it('names the offer when the badge shows a price', () => {
    expect(pinTag([offer({ offerType: 'BUY_ONE_GET_ONE' })])).toEqual({
      text: '1-for-1',
      tone: 'promo',
    })
    expect(pinTag([offer({ offerType: 'PERCENT_OFF', discountPercent: 40 })])).toEqual({
      text: '−40%',
      tone: 'promo',
    })
  })

  it('never repeats what the badge already says', () => {
    expect(
      pinTag([offer({ label: '1-for-1', priceMinor: null, offerType: 'BUY_ONE_GET_ONE' })]),
    ).toBeNull()
    expect(
      pinTag([
        offer({
          label: '20% off',
          priceMinor: null,
          offerType: 'PERCENT_OFF',
          discountPercent: 20,
        }),
      ]),
    ).toBeNull()
    expect(pinTag([offer({})])).toBeNull()
  })

  it('counts the deals when several share an outlet and one price leads', () => {
    expect(pinTag([offer({}), offer({ label: '$2', priceMinor: 200 })])).toEqual({
      text: '2 deals',
      tone: 'plain',
    })
    expect(
      pinTag([offer({ priceMinor: null, label: 'A' }), offer({ priceMinor: null, label: 'B' })]),
    ).toBeNull()
  })
})

describe('createVenuePinIcon', () => {
  it('builds an animated 3D food and a badge, never parsing HTML', () => {
    const icon = createVenuePinIcon({
      deals: [
        {
          title: '<img src=x onerror=alert(1)>',
          label: '<b>$12</b>',
          category: 'DRINKS',
          validUntil: null,
          votes: { alive: 0, dead: 0 },
        },
      ] as never,
    })
    const element = icon.createIcon()

    expect(icon.options.className).toBe(DEAL_PIN_CLASS)
    expect(icon.options.iconSize).toEqual([0, 0])
    const bubble = element.querySelector(`.${DEAL_PIN_CLASS}__bubble`) as HTMLElement
    const food = bubble.querySelector('.food-sprite') as HTMLElement
    expect(food.style.backgroundImage).toContain('/food-anim/drinks-128.webp')
    expect(food.classList.contains('food-sprite--still')).toBe(false)
    expect(element.querySelector(`.${DEAL_PIN_CLASS}__badge`)?.textContent).toBe('<b>$12</b>')
    expect(element.querySelector('b')).toBeNull()
    expect(element.querySelector('img')).toBeNull()
  })

  it('hangs the oval on a stem and a dot that marks the exact spot', () => {
    const element = createVenuePinIcon({
      deals: [
        {
          ...(offer({ offerType: 'BUY_ONE_GET_ONE' }) as object),
          category: 'FOOD',
          validUntil: null,
          votes: { alive: 0, dead: 0 },
        },
      ] as never,
    }).createIcon()
    const stack = element.querySelector(`.${DEAL_PIN_CLASS}__stack`) as HTMLElement
    expect([...stack.children].map((child) => child.className)).toEqual([
      `${DEAL_PIN_CLASS}__bubble`,
      `${DEAL_PIN_CLASS}__stem`,
      `${DEAL_PIN_CLASS}__dot`,
    ])
    const tag = element.querySelector(`.${DEAL_PIN_CLASS}__tag`) as HTMLElement
    expect(tag.textContent).toBe('1-for-1')
    expect(tag.classList).toContain(`${DEAL_PIN_CLASS}__tag--promo`)
  })
})

describe('pin food', () => {
  it('shows the dish the deal names, not just its category', () => {
    const icon = createVenuePinIcon({
      name: 'PastaMania City Square',
      deals: [
        {
          title: 'PastaMania: second main at half price',
          label: '1-for-1',
          category: 'FOOD',
          validUntil: null,
          votes: { alive: 0, dead: 0 },
        },
      ] as never,
    })
    const food = icon.createIcon().querySelector('.food-sprite') as HTMLElement
    expect(food.style.backgroundImage).toContain('/food-anim/pasta-128.webp')
  })
})

describe('pin flags and state', () => {
  const NOW = new Date('2026-10-20T02:00:00.000Z')
  const quiet = { validUntil: null, votes: { alive: 0, dead: 0 } }
  const verified = { validUntil: null, votes: { alive: 3, dead: 0 } }
  const endingToday = { validUntil: '2026-10-20T10:00:00.000Z', votes: { alive: 0, dead: 0 } }

  it('flags ending-today outlets first, then verified ones', () => {
    expect(pinFlag([quiet], NOW)).toBeNull()
    expect(pinFlag([verified], NOW)).toBe('verified')
    expect(pinFlag([verified, endingToday], NOW)).toBe('ending')
  })

  it('draws the flag and carries selected, dimmed and hot classes', () => {
    const icon = createVenuePinIcon(
      { deals: [{ title: 'Kopi', label: '$1', category: 'DRINKS', ...verified }] as never },
      { selected: true, hot: true },
      NOW,
    )
    const element = icon.createIcon()
    expect(icon.options.className).toBe(`${DEAL_PIN_CLASS} is-selected is-hot`)
    expect(element.querySelector(`.${DEAL_PIN_CLASS}__flag--verified`)).not.toBeNull()
  })
})
