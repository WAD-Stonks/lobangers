import {
  isoToSingaporeInput,
  minorToPriceInput,
  priceInputToMinor,
  singaporeInputToIso,
} from '@web/modules/admin-deals/deal-editor-values'
import { expect, it } from 'vitest'

it.each([0, 1, 29, 101, 1290, 1_000_000])('round-trips %i cents without rounding', (minor) => {
  expect(priceInputToMinor(minorToPriceInput(minor))).toBe(minor)
})
it('accepts empty and whole-dollar prices and rejects unsupported decimal formats', () => {
  expect(priceInputToMinor('')).toBeNull()
  expect(priceInputToMinor('12')).toBe(1200)
  expect(priceInputToMinor('12.9')).toBe(1290)
  for (const value of ['-1', '1.001', '1e2', 'Infinity', '12,90', '9007199254740991'])
    expect(() => priceInputToMinor(value)).toThrow()
})
it('round-trips UTC instants through explicit Singapore time, including milliseconds and year boundaries', () => {
  for (const iso of ['2026-11-03T02:30:45.123Z', '2026-12-31T20:00:00.000Z'])
    expect(singaporeInputToIso(isoToSingaporeInput(iso))).toBe(iso)
  expect(isoToSingaporeInput('2026-12-31T20:00:00.000Z')).toBe('2027-01-01T04:00:00.000')
  expect(singaporeInputToIso('2026-11-03T10:30')).toBe('2026-11-03T02:30:00.000Z')
  expect(singaporeInputToIso('')).toBeNull()
})
it.each(['2026-02-30T10:00', '2026-11-03T24:00', '2026-11-03T10:00Z', 'not a date'])(
  'rejects invalid or timezone-ambiguous date input %s',
  (value) => expect(() => singaporeInputToIso(value)).toThrow(),
)
