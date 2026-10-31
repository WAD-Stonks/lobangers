import { parseConfig } from '@api/config'
import { describe, expect, it } from 'vitest'

const base = {
  DATABASE_URL: 'mongodb://127.0.0.1:27017/synthetic',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
}
describe('ingestion configuration', () => {
  it('fails closed unless both explicit opt-ins are true', () => {
    expect(parseConfig(base).ingestion).toMatchObject({ enabled: false, reuseApproved: false })
    expect(
      parseConfig({ ...base, INGESTION_ENABLED: 'true', MONEYDIGEST_REUSE_APPROVED: 'true' })
        .ingestion,
    ).toMatchObject({ enabled: true, reuseApproved: true })
    expect(() => parseConfig({ ...base, INGESTION_ENABLED: 'yes' })).toThrow('INGESTION_ENABLED')
  })
  it.each(['s'.repeat(32), 'base64url_-'.repeat(20), 's'.repeat(256)])(
    'uses only the standard Vercel CRON_SECRET without enabling ingestion: %s',
    (secret) => {
      expect(
        parseConfig({ ...base, CRON_SECRET: secret, INGESTION_CRON_SECRET: 'old'.repeat(16) })
          .ingestion,
      ).toMatchObject({ cronSecret: secret, enabled: false, reuseApproved: false })
    },
  )
  it.each([
    undefined,
    '',
    'UNSET',
    'UNCONFIGURED',
    's'.repeat(31),
    's'.repeat(257),
    ` ${'s'.repeat(32)}`,
    `${'s'.repeat(32)} `,
    `${'s'.repeat(32)}\n`,
    `${'s'.repeat(32)}é`,
    `${'s'.repeat(32)}=`,
    `${'s'.repeat(32)}+`,
    `${'s'.repeat(32)}/`,
  ])('fails closed for missing or malformed CRON_SECRET without legacy fallback: %s', (secret) => {
    expect(
      parseConfig({ ...base, CRON_SECRET: secret, INGESTION_CRON_SECRET: 'old'.repeat(16) })
        .ingestion?.cronSecret,
    ).toBeUndefined()
  })
  it('does not configure OneMap from partial or placeholder secrets', () => {
    expect(
      parseConfig({ ...base, ONEMAP_EMAIL: 'synthetic@example.test' }).ingestion?.oneMap,
    ).toBeUndefined()
    expect(
      parseConfig({
        ...base,
        ONEMAP_EMAIL: 'synthetic@example.test',
        ONEMAP_EMAIL_PASSWORD: 'UNSET',
      }).ingestion?.oneMap,
    ).toBeUndefined()
    expect(
      parseConfig({
        ...base,
        ONEMAP_EMAIL: 'synthetic@example.test',
        ONEMAP_EMAIL_PASSWORD: 'synthetic-password',
      }).ingestion?.oneMap,
    ).toEqual({ email: 'synthetic@example.test', password: 'synthetic-password' })
  })
})
