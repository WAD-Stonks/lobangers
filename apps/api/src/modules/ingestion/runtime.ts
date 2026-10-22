import type { AppConfig } from '@api/config'
import { createImportedImageStorage } from '@api/modules/ingestion/imported-image-storage'
import type { SourceDefinition } from '@api/modules/ingestion/source'
import type { OneMapClient, OneMapMatch } from '@broke-oclock/integrations/server'
export type SourceRuntime = {
  source: SourceDefinition
  reuseApproved: boolean
  listPosts: (options: {
    page: number
    perPage: number
    cursor?: string | null
  }) => Promise<{ posts: readonly unknown[]; nextCursor: string | null }>
}
export type FetchedSourceImage = {
  bytes: Uint8Array
  mimeType: string
  byteLength: number
  sha256: string
  url: string
  finalUrl: string
}
export type ImportedImageStorage = {
  upload: (image: FetchedSourceImage, customId: string) => Promise<{ key: string; url: string }>
  resolve: (customId: string) => Promise<{ key: string; url: string } | null>
}
export type IngestionRuntime = {
  deadline?: Date
  fetchImage?: (
    url: string,
    options: { source: SourceDefinition['kind'] },
  ) => Promise<FetchedSourceImage>
  imageStorage?: ImportedImageStorage
  sourceRuntime?: (source: SourceDefinition) => SourceRuntime
  sources?: readonly SourceRuntime[]
  enabled: boolean
  reuseApproved: boolean
  listPosts: (options: { page: number; perPage: number }) => Promise<readonly unknown[]>
  searchLocations?: (query: string) => Promise<OneMapMatch[]>
  now: () => Date
}
export const createIngestionRuntime = (
  config: AppConfig,
  external: { fetch?: typeof fetch } = {},
): IngestionRuntime => {
  const options = config.ingestion
  const oneMap = options?.oneMap
  return {
    enabled: options?.enabled ?? false,
    imageStorage: createImportedImageStorage(config),
    sourceRuntime: (source) => ({
      source,
      reuseApproved:
        source.kind === 'moneydigest'
          ? (options?.reuseApproved ?? false)
          : source.kind === 'scoobify'
            ? (options?.scoobifyReuseApproved ?? false)
            : true,
      listPosts: async (page) => {
        const { createMoneyDigestClient, createScoobifyClient, createTelegramClient } =
          await import('@broke-oclock/integrations/server')
        if (source.kind === 'telegram')
          return createTelegramClient({ ...external, previewUrl: source.url }).listPosts(page)
        if (source.kind === 'scoobify') return createScoobifyClient(external).listPosts(page)
        const posts = await createMoneyDigestClient(external).listPosts(page)
        return { posts, nextCursor: posts.length === page.perPage ? String(page.page + 1) : null }
      },
    }),
    fetchImage: async (url, request) => {
      const { createSourceImageClient } = await import('@broke-oclock/integrations/server')
      return createSourceImageClient(external).fetchImage(url, request)
    },
    reuseApproved: options?.reuseApproved ?? false,
    now: () => new Date(),
    listPosts: async (page) => {
      const { createMoneyDigestClient } = await import('@broke-oclock/integrations/server')
      return createMoneyDigestClient().listPosts(page)
    },
    ...(oneMap
      ? {
          searchLocations: (() => {
            // A single provider client retains its token cache across request contexts.
            let client: Promise<OneMapClient> | undefined
            return async (query: string) => {
              client ??= import('@broke-oclock/integrations/server').then(
                ({ createOneMapClient }) => createOneMapClient(oneMap),
              )
              return (await client).search(query)
            }
          })(),
        }
      : {}),
  }
}
