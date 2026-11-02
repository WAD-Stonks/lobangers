// Shared Intl formatters. Every deal is local, so text is formatted for en-SG and shown in
// Singapore time whatever the visitor's browser reports. Formatters are built once and reused.
const LOCALE = 'en-SG'
const SINGAPORE_TIME_ZONE = 'Asia/Singapore'
const DEFAULT_CURRENCY = 'SGD'
const MINOR_UNITS = 100
const KILOMETRE = 1000
const METRE_ROUNDING = 10
const MINUTE_SECONDS = 60
const HOUR_SECONDS = 3600
const DAY_SECONDS = 86_400

const currencyFormats = new Map<string, Intl.NumberFormat>()

const currencyFormat = (currency: string): Intl.NumberFormat => {
  const cached = currencyFormats.get(currency)
  if (cached) return cached
  const created = new Intl.NumberFormat(LOCALE, { style: 'currency', currency })
  currencyFormats.set(currency, created)
  return created
}

// "$5.00" from 500 minor units.
export const formatMoneyMinor = (minor: number, currency = DEFAULT_CURRENCY): string =>
  currencyFormat(currency).format(minor / MINOR_UNITS)

// "$5" from 5 major units, keeping cents only when there are some: "$4.50".
export const formatMoneyMajor = (major: number, currency = DEFAULT_CURRENCY): string =>
  Number.isInteger(major)
    ? new Intl.NumberFormat(LOCALE, {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(major)
    : currencyFormat(currency).format(major)

const metreFormat = new Intl.NumberFormat(LOCALE, {
  style: 'unit',
  unit: 'meter',
  maximumFractionDigits: 0,
})
const kilometreFormat = new Intl.NumberFormat(LOCALE, {
  style: 'unit',
  unit: 'kilometer',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

// "350 m" under a kilometre (rounded to 10 m), "1.3 km" past it.
export const formatDistance = (metres: number): string => {
  const rounded = Math.round(metres / METRE_ROUNDING) * METRE_ROUNDING
  if (rounded < KILOMETRE) return metreFormat.format(rounded)
  return kilometreFormat.format(metres / KILOMETRE)
}

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: SINGAPORE_TIME_ZONE,
})
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: SINGAPORE_TIME_ZONE,
})

const toDate = (value: string | number | Date): Date | null => {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// "31 Dec 2026"; an unreadable value is returned as given rather than "Invalid Date".
export const formatDate = (value: string | number | Date): string => {
  const date = toDate(value)
  return date ? dateFormat.format(date) : String(value)
}

// "31 Dec 2026, 3:05 pm".
export const formatDateTime = (value: string | number | Date): string => {
  const date = toDate(value)
  return date ? dateTimeFormat.format(date) : String(value)
}

const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto', style: 'short' })

// "Just now", "5 min ago", "3 hr ago", then a plain date after a day.
export const formatRelativeTime = (value: string | number | Date, now = Date.now()): string => {
  const date = toDate(value)
  if (!date) return String(value)
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000))
  if (seconds < MINUTE_SECONDS) return 'Just now'
  if (seconds < HOUR_SECONDS)
    return relativeFormat.format(-Math.floor(seconds / MINUTE_SECONDS), 'minute')
  if (seconds < DAY_SECONDS)
    return relativeFormat.format(-Math.floor(seconds / HOUR_SECONDS), 'hour')
  return dateFormat.format(date)
}

const countFormat = new Intl.NumberFormat(LOCALE)

// "2,000".
export const formatCount = (value: number): string => countFormat.format(value)
