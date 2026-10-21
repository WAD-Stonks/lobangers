import {
  classifyDealCategory,
  DEAL_CATEGORIES,
  DEFAULT_DEAL_CATEGORY,
  dealCategorySchema,
} from '@broke-oclock/contracts/deal-categories'
import { describe, expect, it } from 'vitest'

describe('deal categories', () => {
  it('lists the categories the map can draw and defaults to food', () => {
    expect(DEAL_CATEGORIES).toEqual(['FOOD', 'DRINKS', 'DESSERT', 'SNACKS', 'BAKERY'])
    expect(DEFAULT_DEAL_CATEGORY).toBe('FOOD')
    expect(dealCategorySchema.safeParse('MYSTERY').success).toBe(false)
    expect(dealCategorySchema.parse('BAKERY')).toBe('BAKERY')
  })
})

describe('classifyDealCategory', () => {
  it.each([
    ['Molly Tea Hillion Mall: flower with a drink and social post', 'DRINKS'],
    ['Free Raspberry Ripple blend with S$100 retail spend at Clipper Tea Jewel', 'DRINKS'],
    ['Two Oishi Lao Gan Ma snack packs for S$4.95', 'SNACKS'],
    ['Sushi Express Big Eater Challenge: tiered discounts for teams of two', 'FOOD'],
    ['1-for-1 gelato every Tuesday', 'DESSERT'],
    ['Buy two croissants get one free', 'BAKERY'],
    ['Kopi set at S$4.50', 'DRINKS'],
  ])('classifies "%s" as %s from the title alone', (title, category) => {
    expect(classifyDealCategory(title)).toBe(category)
  })

  it('falls back to food when nothing matches', () => {
    expect(classifyDealCategory('')).toBe('FOOD')
    expect(classifyDealCategory('Weekend special', 'Members only.')).toBe('FOOD')
  })

  it('uses the body when the title says nothing about the product', () => {
    expect(
      classifyDealCategory('Weekend special', 'Fresh sourdough and baguettes half price.'),
    ).toBe('BAKERY')
  })

  it('weighs the title above a passing mention in the body', () => {
    expect(
      classifyDealCategory('Kopi promotion', 'Add a slice of cake for S$2 with any order.'),
    ).toBe('DRINKS')
  })

  it.each([
    ['☕STARBUCKS☕', 'DRINKS'],
    ['🧋HEYTEA🧋', 'DRINKS'],
    ['#TIGERSUGARSG', 'DRINKS'],
    ['#Playmade🧋', 'DRINKS'],
    ['CHAGEE’s Adorable Bes-Tea Brew Crew Plushies', 'DRINKS'],
    ['#TukTukCha', 'DRINKS'],
    ['🍗 IKEA🍗', 'FOOD'],
    ['🥘HAIDILAO DEALS🥘', 'FOOD'],
    ['🎂 Cat & the Fiddle 🍰', 'DESSERT'],
    ['🍦 Soft serve at the hall', 'DESSERT'],
  ])('classifies the brand-only title "%s" as %s', (title, category) => {
    expect(classifyDealCategory(title)).toBe(category)
  })

  it('matches whole words only and ignores case', () => {
    expect(classifyDealCategory('CHEESECAKE slices')).toBe('DESSERT')
    expect(classifyDealCategory('Teapot sale')).toBe('FOOD')
  })
})
