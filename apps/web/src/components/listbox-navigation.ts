import type { SelectOption } from '@web/components/select-options'

const TYPEAHEAD_RESET_MS = 500

const enabled = (options: readonly SelectOption[], index: number) =>
  index >= 0 && index < options.length && !options[index]?.disabled

export const stepIndex = (options: readonly SelectOption[], from: number, step: 1 | -1) => {
  for (let index = from + step; index >= 0 && index < options.length; index += step) {
    if (enabled(options, index)) return index
  }
  return from
}

export const firstIndex = (options: readonly SelectOption[]) => stepIndex(options, -1, 1)
export const lastIndex = (options: readonly SelectOption[]) =>
  stepIndex(options, options.length, -1)

export const startIndex = (options: readonly SelectOption[], value: string) => {
  const selected = options.findIndex((option) => option.value === value)
  return enabled(options, selected) ? selected : firstIndex(options)
}

export const isPrintableKey = (event: KeyboardEvent) =>
  event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey

export const createTypeahead = () => {
  let buffer = ''
  let resetAt = 0
  return (options: readonly SelectOption[], from: number, key: string) => {
    const now = Date.now()
    buffer = now > resetAt ? key.toLowerCase() : buffer + key.toLowerCase()
    resetAt = now + TYPEAHEAD_RESET_MS
    const ordered = options.map((_, offset) => (from + 1 + offset) % options.length)
    const sameLetter = [...buffer].every((letter) => letter === buffer[0])
    const query = sameLetter ? (buffer[0] ?? '') : buffer
    const searchFrom = sameLetter ? ordered : [from, ...ordered]
    const match = searchFrom.find(
      (index) => enabled(options, index) && options[index]?.label.toLowerCase().startsWith(query),
    )
    return match ?? from
  }
}
