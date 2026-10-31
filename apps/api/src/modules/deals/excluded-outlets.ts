// Reads the places a deal's own terms rule out, such as "Not at Sentosa or the Zoo.", so a
// deal without confirmed outlets is not pinned at a branch it names as excluded. Product
// exclusions ("Excludes Reserve drinks") are deliberately not read as places.
const EXCLUSION_CLAUSE = /\b(?:not (?:valid |available )?at|except at)\s+([^.;]+)/gi
const LIST_SEPARATOR = /,|\bor\b|\band\b/i
const LEADING_ARTICLE = /^the\s+/
const TRAILING_OUTLET_WORD = /\s+(?:outlets?|branch(?:es)?|stores?)$/

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const excludedPlacesIn = (terms: string | null | undefined): string[] =>
  [...(terms ?? '').matchAll(EXCLUSION_CLAUSE)].flatMap((match) =>
    (match[1] ?? '')
      .split(LIST_SEPARATOR)
      .map((place) =>
        place.trim().toLowerCase().replace(LEADING_ARTICLE, '').replace(TRAILING_OUTLET_WORD, ''),
      )
      .filter((place) => place.length > 0),
  )

export const isExcludedVenue = (
  venue: { name: string; address: string },
  places: readonly string[],
): boolean => {
  const text = `${venue.name} ${venue.address}`.toLowerCase()
  return places.some((place) => new RegExp(`\\b${escapeRegExp(place)}\\b`).test(text))
}
