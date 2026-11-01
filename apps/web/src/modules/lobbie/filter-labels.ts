import type { AssistantFilters } from '@broke-oclock/contracts/assistant'
import { DEAL_CUISINE_LABELS } from '@broke-oclock/contracts/deal-cuisines'
import { formatCategory } from '@web/modules/browse-map/deal-format'

export type FilterToken = {
  readonly key: string
  readonly label: string
  readonly next: AssistantFilters
}

const formatDollars = (minor: number) => {
  const dollars = minor / 100
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

export const filterTokens = (filters: AssistantFilters): readonly FilterToken[] => [
  ...(filters.maxPriceMinor > 0
    ? [
        {
          key: 'price',
          label: `Up to ${formatDollars(filters.maxPriceMinor)}`,
          next: { ...filters, maxPriceMinor: 0 },
        },
      ]
    : []),
  ...(filters.endingToday
    ? [{ key: 'ending', label: 'Ending today', next: { ...filters, endingToday: false } }]
    : []),
  ...(filters.maxWalkMinutes > 0
    ? [
        {
          key: 'walk',
          label: `Within ${filters.maxWalkMinutes} min walk`,
          next: { ...filters, maxWalkMinutes: 0 },
        },
      ]
    : []),
  ...filters.categories.map((category) => ({
    key: `category:${category}`,
    label: formatCategory(category),
    next: { ...filters, categories: filters.categories.filter((other) => other !== category) },
  })),
  ...filters.cuisines.map((cuisine) => ({
    key: `cuisine:${cuisine}`,
    label: DEAL_CUISINE_LABELS[cuisine],
    next: { ...filters, cuisines: filters.cuisines.filter((other) => other !== cuisine) },
  })),
]
