export const minorToPriceInput = (minor: number | null): string => {
  if (minor === null) return ''
  const absolute = Math.abs(minor)
  return `${minor < 0 ? '-' : ''}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
}

export const priceInputToMinor = (value: string): number | null => {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d+(?:\.\d{1,2})?$/u.test(trimmed))
    throw new Error('Enter a price with no more than two decimal places.')
  const [whole = '', fraction = ''] = trimmed.split('.')
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(minor)) throw new Error('Enter a valid price.')
  return minor
}

export { isoToSingaporeInput, singaporeInputToIso } from '@web/lib/admin-date-input'
