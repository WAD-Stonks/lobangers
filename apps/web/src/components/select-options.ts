export type SelectOption = {
  readonly value: string
  readonly label: string
  readonly disabled?: boolean
}

// For lists whose shown text is the value itself, like OPEN / RESOLVED.
export const optionsFromValues = (values: readonly string[]): readonly SelectOption[] =>
  values.map((value) => ({ value, label: value }))

export const optionsFromLabels = (
  labels: Readonly<Record<string, string>>,
): readonly SelectOption[] => Object.entries(labels).map(([value, label]) => ({ value, label }))

export const withLeading = (
  first: SelectOption,
  rest: readonly SelectOption[],
): readonly SelectOption[] => [first, ...rest]
