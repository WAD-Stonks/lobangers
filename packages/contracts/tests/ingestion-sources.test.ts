import {
  ingestionAddSourceRequestSchema,
  ingestionSetSourceEnabledRequestSchema,
  ingestionSourceIdSchema,
  ingestionSourceSchema,
  ingestionSourcesQuerySchema,
  telegramPreviewUrlSchema,
} from '@broke-oclock/contracts/ingestion-sources'
import { describe, expect, it } from 'vitest'

const denied = [
  'c',
  's',
  'joinchat',
  'share',
  'proxy',
  'socks',
  'login',
  'contact',
  'invoice',
  'boost',
  'iv',
  'addstickers',
  'addemoji',
  'addlist',
  'setlanguage',
  'bg',
  'giftcode',
  'stars',
  'confirmphone',
]
describe('Telegram source browser-safe literal contracts', () => {
  it('accepts bounded nonempty ASCII preview candidates including short collectible names without claiming availability', () => {
    for (const name of [
      'a',
      'ab',
      'Ab3',
      '1channel',
      '_a',
      'channel_',
      'ThisCounted',
      'a'.repeat(32),
    ]) {
      const url = `https://t.me/s/${name}`
      expect(telegramPreviewUrlSchema.parse(url)).toBe(url)
    }
  })
  it('rejects reserved routes case-insensitively and refuses all URL-parser repairs or extra URL syntax', () => {
    for (const url of [
      ...denied.flatMap((name) => [
        `https://t.me/s/${name}`,
        `https://t.me/s/${name.toUpperCase()}`,
      ]),
      'https://t.me/s/',
      `https://t.me/s/${'a'.repeat(33)}`,
      'http://t.me/s/name',
      'https://t.me:443/s/name',
      'https://user@t.me/s/name',
      'https://T.ME/s/name',
      'https://t.me.evil/s/name',
      'https://t.me/s/name/',
      'https://t.me/s/name?before=1',
      'https://t.me/s/name#fragment',
      'https://t.me/s/name\n',
      'https://t.me/s/name\r',
      ' https://t.me/s/name',
      'https://t.me/s/name%2Fother',
      'https://t.me/s/%6eame',
      'https://t.me/s/../name',
      'https://t.me/s/name/1',
      'https://t.me/c/123',
      'https://t.me/+invite',
    ])
      expect(telegramPreviewUrlSchema.safeParse(url).success, url).toBe(false)
  })
  it('bounds pagination and rejects malformed source IDs literally', () => {
    expect(ingestionSourcesQuerySchema.parse({})).toEqual({ limit: 20 })
    expect(ingestionSourcesQuerySchema.parse({ limit: '50' })).toEqual({ limit: 50 })
    for (const input of [
      { limit: 51 },
      { limit: 0 },
      { limit: ['1'] },
      { limit: ' 2' },
      { actorId: 'x' },
    ])
      expect(ingestionSourcesQuerySchema.safeParse(input).success).toBe(false)
    expect(ingestionSourceIdSchema.safeParse('0123456789abcdef01234567\n').success).toBe(false)
  })
  it('projects only registered provider/identity/URL pairs, never executable or arbitrary outlet links', () => {
    const row = {
      id: '0123456789abcdef01234567',
      name: 'Fixture',
      provider: 'TELEGRAM',
      externalId: 'ThisCounted',
      url: 'https://t.me/s/ThisCounted',
      enabled: false,
      updatedAt: '2026-10-20T00:00:00.000Z',
    }
    expect(ingestionSourceSchema.safeParse(row).success).toBe(true)
    for (const invalid of [
      { ...row, url: 'javascript:alert(1)' },
      { ...row, url: 'https://evil.test/' },
      { ...row, externalId: 'anotherchannel' },
      {
        ...row,
        provider: 'WORDPRESS',
        externalId: 'arbitrary.test',
        url: 'https://arbitrary.test/',
      },
    ])
      expect(ingestionSourceSchema.safeParse(invalid).success).toBe(false)
    expect(
      ingestionSourceSchema.safeParse({
        ...row,
        provider: 'WORDPRESS',
        externalId: 'moneydigest.sg',
        url: 'https://www.moneydigest.sg/',
      }).success,
    ).toBe(true)
  })
  it('creates disabled-by-contract and requires a fresh timestamp and explicit enabling confirmation', () => {
    expect(
      ingestionAddSourceRequestSchema.parse({
        name: ' Fixture ',
        previewUrl: 'https://t.me/s/name',
      }),
    ).toEqual({ name: 'Fixture', previewUrl: 'https://t.me/s/name' })
    expect(
      ingestionAddSourceRequestSchema.safeParse({
        name: 'Fixture',
        previewUrl: 'https://t.me/s/name',
        enabled: true,
      }).success,
    ).toBe(false)
    const version = { expectedUpdatedAt: '2026-10-20T00:00:00.000Z' }
    expect(
      ingestionSetSourceEnabledRequestSchema.safeParse({ ...version, enabled: true }).success,
    ).toBe(false)
    expect(ingestionSetSourceEnabledRequestSchema.parse({ ...version, enabled: false })).toEqual({
      ...version,
      enabled: false,
      reuseConfirmed: false,
    })
    expect(
      ingestionSetSourceEnabledRequestSchema.parse({
        ...version,
        enabled: true,
        reuseConfirmed: true,
      }).enabled,
    ).toBe(true)
  })
})
