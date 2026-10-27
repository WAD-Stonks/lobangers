import { telegramPreviewUrlSchema } from '@broke-oclock/contracts/ingestion-sources'

export const parseTelegramPreviewUrl = (input: string) => {
  const url = telegramPreviewUrlSchema.parse(input)
  const username = url.slice('https://t.me/s/'.length)
  return { username, externalId: username.toLowerCase(), url: `https://t.me/s/${username}` }
}
export const isRegisteredTelegramSource = (source: {
  provider: string
  externalId: string
  url: string
}) => {
  if (source.provider !== 'TELEGRAM' || !telegramPreviewUrlSchema.safeParse(source.url).success)
    return false
  return parseTelegramPreviewUrl(source.url).externalId === source.externalId.toLowerCase()
}
