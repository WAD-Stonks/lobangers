import { foodKindFor, foodKindForCategory } from '@web/modules/browse-map/food-kind'
import { describe, expect, it } from 'vitest'

const deal = (category: string, title: string, venue = '') => ({
  category,
  title,
  venueNames: [venue],
})

describe('foodKindFor', () => {
  it('picks a dish for food deals from the title or venue', () => {
    expect(
      foodKindFor(deal('FOOD', 'PastaMania: second main at half price', 'PastaMania City Square')),
    ).toBe('pasta')
    expect(foodKindFor(deal('food', '🍲 HAIDILAO 🍲', 'Haidilao Hot Pot @Northpoint'))).toBe(
      'hotpot',
    )
    expect(foodKindFor(deal('FOOD', 'McDonald’s Launches SpongeBob Happy Meal Toys'))).toBe(
      'burger',
    )
    expect(foodKindFor(deal('FOOD', '🍗TEXAS CHICKEN ONE PUNGGOL'))).toBe('chicken')
    expect(foodKindFor(deal('FOOD', 'Big Eater Challenge', 'Sushi Express, PLQ Mall'))).toBe(
      'sushi',
    )
    expect(foodKindFor(deal('FOOD', '1-for-1 large pizzas', "Domino's"))).toBe('pizza')
  })

  it('keeps laksa for food deals that name no dish', () => {
    expect(foodKindFor(deal('FOOD', 'Free pancake with any rice bowl', 'ALC Ricebowl'))).toBe(
      'laksa',
    )
  })

  it('shows bubble tea for tea-chain drinks and kopi for other drinks', () => {
    expect(foodKindFor(deal('DRINKS', '🧋BEUTEA - FREE White Peach Oolong Milk Tea🧋'))).toBe(
      'boba',
    )
    expect(foodKindFor(deal('DRINKS', 'CHAGEE plushies are back'))).toBe('boba')
    expect(foodKindFor(deal('DRINKS', 'Free flower with any drink', 'Hillion Mall'))).toBe('kopi')
  })

  it('leaves the other categories on their own model', () => {
    expect(foodKindFor(deal('DESSERT', 'Pizza-flavoured ice cream'))).toBe('softserve')
    expect(foodKindFor(deal('SNACKS', '2 Lao Gan Ma snacks'))).toBe('puff')
    expect(foodKindFor(deal('BAKERY', 'Egg tarts'))).toBe('tart')
    expect(foodKindFor(deal('MYSTERY', 'Something'))).toBe('ticket')
  })
})

describe('foodKindForCategory', () => {
  it('gives the default model for a category on its own', () => {
    expect(foodKindForCategory('FOOD')).toBe('laksa')
    expect(foodKindForCategory('drinks')).toBe('kopi')
    expect(foodKindForCategory('OTHER')).toBe('ticket')
  })
})
