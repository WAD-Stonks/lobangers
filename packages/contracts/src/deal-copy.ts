// Shape of the text shown on a deal card and panel. The web lists terms as points; the copy
// tidy-up tool rejects rewrites that break these limits, so long scraped copy cannot creep back.
export const DEAL_COPY_LIMITS = {
  titleChars: 40,
  descriptionChars: 120,
  termsPoints: 4,
  termsPointChars: 90,
} as const

// A break needs whitespace after the stop, so "S$2.90" and "2:30pm" stay whole.
const TERMS_BREAK = /(?<=[.;!?])\s+/
const TRAILING_STOP = /[.;]+$/

export const splitTerms = (terms: string | null): readonly string[] =>
  (terms ?? '')
    .split(TERMS_BREAK)
    .map((point) => point.trim().replace(TRAILING_STOP, ''))
    .filter((point) => point.length > 0)
    .map((point) => point.charAt(0).toUpperCase() + point.slice(1))

// Shared deals read in Singapore time, whatever time zone the sender's device reports.
const SINGAPORE_TIME_ZONE = 'Asia/Singapore'
const fullDay = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: SINGAPORE_TIME_ZONE,
})
const instant = (iso: string | null | undefined) => {
  const date = iso ? new Date(iso) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

// When a shared deal runs: "Available from 14 Oct 2026 to 31 Dec 2026", "Available until 31 Dec 2026"
// or "Available from 14 Oct 2026"; null when no dates are known. validUntil is the exclusive end,
// so the last day is the one before it.
export const dealShareDates = (
  validFrom: string | null | undefined,
  validUntil: string | null,
): string | null => {
  const start = instant(validFrom)
  const end = instant(validUntil)
  const lastDay = end && new Date(end.getTime() - 1)
  if (start && lastDay && lastDay >= start)
    return `Available from ${fullDay.format(start)} to ${fullDay.format(lastDay)}`
  if (lastDay) return `Available until ${fullDay.format(lastDay)}`
  if (start) return `Available from ${fullDay.format(start)}`
  return null
}

export const DEAL_SHARE_SIGN_OFF = 'Found on Lobangers — Your next good lobang awaits!'

// "KFC (Compass One)" reads as "KFC — Compass One"; other names stay as they are.
export const dealShareVenue = (venueName: string) => {
  const outlet = /^(.+?)\s*\((.+)\)$/.exec(venueName.trim())
  return outlet ? `${outlet[1]} — ${outlet[2]}` : venueName.trim()
}

// The message under a shared deal's picture: the deal, where and when, and a link to it.
export const dealShareMessage = (share: {
  title: string
  venueName: string
  dates: string | null
  url: string
}) =>
  [
    `🍗 ${share.title.replace(/[.!]*$/, '')}!`,
    [`🏪 ${dealShareVenue(share.venueName)}`, share.dates && `📅 ${share.dates}`]
      .filter(Boolean)
      .join('\n'),
    "🔥 Don't miss out on this lobang!",
    `🔗 Check out the deal:\n${share.url}`,
    `🦞 ${DEAL_SHARE_SIGN_OFF}`,
  ].join('\n\n')
