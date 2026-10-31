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
