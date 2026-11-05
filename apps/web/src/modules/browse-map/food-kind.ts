export type FoodKind =
  | 'laksa'
  | 'kopi'
  | 'softserve'
  | 'puff'
  | 'tart'
  | 'ticket'
  | 'pasta'
  | 'burger'
  | 'chicken'
  | 'sushi'
  | 'hotpot'
  | 'pizza'
  | 'boba'

const CATEGORY_KIND: Record<string, FoodKind> = {
  FOOD: 'laksa',
  DRINKS: 'kopi',
  DESSERT: 'softserve',
  SNACKS: 'puff',
  BAKERY: 'tart',
}
const FALLBACK_KIND: FoodKind = 'ticket'

const DISH_CUES: Record<string, readonly (readonly [FoodKind, readonly string[]])[]> = {
  FOOD: [
    ['hotpot', ['hotpot', 'hot pot', 'haidilao', 'steamboat', 'mala', 'shabu']],
    ['pizza', ['pizza', "domino's", 'dominos', 'pizza hut', 'pizzeria']],
    ['burger', ['burger', 'mcdonald', "mcd's", 'mos burger', 'shake shack', 'happy meal']],
    [
      'chicken',
      [
        'fried chicken',
        'kfc',
        'texas chicken',
        'popeyes',
        '4fingers',
        'chix',
        'chicken wing',
        'chicken',
      ],
    ],
    ['sushi', ['sushi', 'sashimi', 'genki', 'nigiri', 'maki']],
    [
      'pasta',
      ['pasta', 'spaghetti', 'carbonara', 'aglio', 'linguine', 'penne', 'lasagna', 'lasagne'],
    ],
    ['boba', ['bubble tea', 'boba', 'milk tea']],
  ],
  DRINKS: [
    [
      'boba',
      [
        'bubble tea',
        'boba',
        'milk tea',
        'chagee',
        'heytea',
        'koi',
        'liho',
        'gong cha',
        'gongcha',
        'tiger sugar',
        'beutea',
        'chicha',
        'playmade',
        'sharetea',
        'mixue',
        'oolong',
      ],
    ],
  ],
}

const escapeCue = (cue: string) => cue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const DISH_PATTERNS = Object.fromEntries(
  Object.entries(DISH_CUES).map(([category, dishes]) => [
    category,
    dishes.map(
      ([kind, cues]) =>
        [
          kind,
          new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${cues.map(escapeCue).join('|')})`, 'iu'),
        ] as const,
    ),
  ]),
)

export const foodKindForCategory = (category: string): FoodKind =>
  CATEGORY_KIND[category.toUpperCase()] ?? FALLBACK_KIND

export type DealForFood = {
  readonly category: string
  readonly title: string
  readonly venueNames?: readonly string[]
}

export const foodKindFor = ({ category, title, venueNames = [] }: DealForFood): FoodKind => {
  const code = category.toUpperCase()
  const text = [title, ...venueNames].join(' ')
  const dish = DISH_PATTERNS[code]?.find(([, pattern]) => pattern.test(text))
  return dish ? dish[0] : foodKindForCategory(code)
}
