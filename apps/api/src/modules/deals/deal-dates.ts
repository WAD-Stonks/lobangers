// Forms send calendar days ('YYYY-MM-DD') as people in Singapore read them. The database keeps
// validFrom as the instant the first day starts and validUntil as the EXCLUSIVE end: the
// instant after the last day. Singapore has no daylight saving, so the offset is fixed.
const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export const startOfDay = (day: string): Date => new Date(`${day}T00:00:00+08:00`)

// The exclusive end for a deal whose last day is `day`.
export const endAfterDay = (day: string): Date => new Date(startOfDay(day).getTime() + DAY_MS)

// The Singapore calendar day an instant falls on.
export const dayOf = (instant: Date): string =>
  new Date(instant.getTime() + SINGAPORE_OFFSET_MS).toISOString().slice(0, 10)

// The last day a deal runs, from its exclusive end.
export const lastDayBefore = (end: Date): string => dayOf(new Date(end.getTime() - 1))
