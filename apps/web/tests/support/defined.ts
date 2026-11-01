// Narrows a value that a test expects to exist, failing loudly when it is missing.
export const defined = <T>(value: T | null | undefined, label = 'Expected value'): T => {
  if (value === null || value === undefined) throw new Error(`${label} is missing`)
  return value
}
