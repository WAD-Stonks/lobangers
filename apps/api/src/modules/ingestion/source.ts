import { parseTelegramPreviewUrl } from '@broke-oclock/integrations/server'

export const MONEYDIGEST_SOURCE = {
  provider: 'WORDPRESS' as const,
  externalId: 'moneydigest.sg',
  name: 'MoneyDigest',
  url: 'https://www.moneydigest.sg/',
}
export const sourceKey = (source: { provider: 'WORDPRESS' | 'TELEGRAM'; externalId: string }) => ({
  provider_externalId: { provider: source.provider, externalId: source.externalId },
})
export const SCOOBIFY_SOURCE = {
  provider: 'WORDPRESS' as const,
  externalId: 'scoobifydaily.wordpress.com',
  name: 'Scoobify Daily',
  url: 'https://scoobifydaily.wordpress.com/',
}
export const TELEGRAM_SOURCE = {
  provider: 'TELEGRAM' as const,
  externalId: 'ThisCounted',
  name: 'ThisCounted',
  url: 'https://t.me/s/ThisCounted',
}
export const SOURCE_DEFINITIONS = [
  { kind: 'moneydigest' as const, ...MONEYDIGEST_SOURCE },
  { kind: 'scoobify' as const, ...SCOOBIFY_SOURCE },
  { kind: 'telegram' as const, ...TELEGRAM_SOURCE },
]
export type SourceDefinition = (typeof SOURCE_DEFINITIONS)[number]
export const sourceFromRecord = (record: {
  provider: string
  externalId: string
  name: string
  url: string
}): SourceDefinition | null => {
  const fixed = SOURCE_DEFINITIONS.find(
    (source) =>
      source.kind !== 'telegram' &&
      source.provider === record.provider &&
      source.externalId === record.externalId &&
      source.url === record.url,
  )
  if (fixed) return { ...fixed, name: record.name }
  if (record.provider !== 'TELEGRAM') return null
  try {
    const identity = parseTelegramPreviewUrl(record.url)
    if (identity.sourceExternalId !== record.externalId.toLowerCase()) return null
    return { ...record, provider: 'TELEGRAM', kind: 'telegram' }
  } catch {
    return null
  }
}
export const sourceWhere = {
  provider_externalId: {
    provider: MONEYDIGEST_SOURCE.provider,
    externalId: MONEYDIGEST_SOURCE.externalId,
  },
}
