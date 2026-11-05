const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000

export const isoToSingaporeInput = (value: string | null): string => {
  if (!value) return ''
  const instant = new Date(value).getTime()
  if (!Number.isFinite(instant)) return ''
  return new Date(instant + SINGAPORE_OFFSET_MS).toISOString().slice(0, -1)
}

export const singaporeInputToIso = (value: string): string | null => {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/u.test(value))
    throw new Error('Choose a valid date and time in Singapore time.')
  const withSeconds = value.length === 16 ? `${value}:00` : value
  const [seconds = '', fraction = ''] = withSeconds.split('.')
  const normalized = `${seconds}.${fraction.padEnd(3, '0')}`
  const instant = new Date(`${normalized}+08:00`)
  if (
    !Number.isFinite(instant.getTime()) ||
    isoToSingaporeInput(instant.toISOString()) !== normalized
  )
    throw new Error('Choose a valid date and time in Singapore time.')
  return instant.toISOString()
}
