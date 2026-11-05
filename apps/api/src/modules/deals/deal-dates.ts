const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export const startOfDay = (day: string): Date => new Date(`${day}T00:00:00+08:00`)

export const endAfterDay = (day: string): Date => new Date(startOfDay(day).getTime() + DAY_MS)

export const dayOf = (instant: Date): string =>
  new Date(instant.getTime() + SINGAPORE_OFFSET_MS).toISOString().slice(0, 10)

export const lastDayBefore = (end: Date): string => dayOf(new Date(end.getTime() - 1))
