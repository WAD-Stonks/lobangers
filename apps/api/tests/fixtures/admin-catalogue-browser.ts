import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseConfig } from '@api/config'
import { apiErrorMiddleware } from '@api/errors'
import express from 'express'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
// biome-ignore lint/style/noRestrictedImports: Shared isolated fixture outside source alias.
import { pushDisposableSchema } from './disposable-schema'

const scratch = resolve(tmpdir(), 'lobangers-catalogue')
let mongo: MongoMemoryReplSet | undefined
let api: Server | undefined
let web: { close: () => Promise<void> } | undefined
let db: typeof import('@broke-oclock/db').db | undefined
const stop = async () => {
  await web?.close()
  api?.closeAllConnections()
  if (api) await new Promise<void>((resolve) => api?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
}
process.on('message', async (message) => {
  if ((message as { operation?: string }).operation === 'stop') {
    await stop()
    process.exit(0)
  }
})
const start = async () => {
  if (process.env.DATABASE_URL) throw new Error('No ambient database allowed')
  await mkdir(scratch, { recursive: true })
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`catalogue_browser_${randomUUID().replaceAll('-', '')}`)
  process.env.DATABASE_URL = databaseUrl
  process.env.NODE_ENV = 'test'
  await pushDisposableSchema(databaseUrl)
  db = (await import('@broke-oclock/db')).db
  api = createServer()
  await new Promise<void>((resolve) => api?.listen(0, '127.0.0.1', resolve))
  const apiAddress = api.address()
  if (!apiAddress || typeof apiAddress === 'string') throw new Error('No API listener')
  const reservation = createServer()
  await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve))
  const reserved = reservation.address()
  if (!reserved || typeof reserved === 'string') throw new Error('No web reservation')
  await new Promise<void>((resolve) => reservation.close(() => resolve()))
  const root = process.cwd()
  const webRequire = createRequire(resolve(root, 'apps/web/package.json'))
  const { createServer: createVite } = await import(pathToFileURL(webRequire.resolve('vite')).href)
  const { default: vue } = await import(
    pathToFileURL(webRequire.resolve('@vitejs/plugin-vue')).href
  )
  const vite = await createVite({
    configFile: false,
    envDir: false,
    root: resolve(root, 'apps/web'),
    cacheDir: resolve(scratch, 'vite-cache'),
    plugins: [
      vue(),
      {
        name: 'catalogue-client-assembly',
        enforce: 'pre',
        resolveId(id: string) {
          if (id === '@web/lib/api-client') return '\0catalogue-client-assembly'
        },
        load(id: string) {
          if (id === '\0catalogue-client-assembly')
            return `import {createApiClient} from '@broke-oclock/api-client'; import {createAdminCatalogueClient} from '/@fs${root}/packages/api-client/src/admin-catalogue.ts'; export {ApiClientError} from '@broke-oclock/api-client'; const base=createApiClient(); export const api={...base, adminCatalogue:createAdminCatalogueClient(base.http)};`
        },
      },
      {
        name: 'catalogue-native-fixture',
        transformIndexHtml: {
          order: 'pre',
          handler: () =>
            `<!doctype html><html><head><title>Connected catalogue</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main id="app"></main><script type="module">import {createApp} from 'vue'; import Page from '/src/pages/AdminCataloguePage.vue'; import '@broke-oclock/ui/styles.css'; import '/src/assets/main.css'; import '/src/assets/bootstrap-theme.css'; createApp(Page).mount('#app');</script></body></html>`,
        },
      },
    ],
    resolve: { tsconfigPaths: true },
    server: {
      host: '127.0.0.1',
      port: reserved.port,
      strictPort: true,
      proxy: { '/api': { target: `http://127.0.0.1:${apiAddress.port}`, changeOrigin: true } },
    },
  })
  web = vite
  await vite.listen()
  const webURL = `http://127.0.0.1:${reserved.port}`
  const { createApp, createAuth } = await import('@api/app')
  const { createAdminCatalogueRouter } = await import('@api/rest/routers/admin-catalogue')
  const config = parseConfig({
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    BETTER_AUTH_URL: webURL,
    WEB_ORIGIN: webURL,
  })
  const app = express()
  app.use(
    '/api/admin/catalogue',
    express.json(),
    createAdminCatalogueRouter({ config, auth: createAuth(config) }),
  )
  app.use(createApp(config))
  app.use(apiErrorMiddleware)
  api.on('request', app)
  const email = `catalogue-${randomUUID()}@example.test`
  const password = randomBytes(24).toString('hex')
  const signup = await fetch(`${webURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { Origin: webURL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Synthetic catalogue operator', email, password }),
  })
  if (signup.status !== 200) throw new Error(`Native signup failed: ${signup.status}`)
  const user = await db.user.findUniqueOrThrow({ where: { email } })
  await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } })
  process.send?.({ ready: true, webURL, email, password })
}
start().catch(async (error) => {
  process.send?.({ failure: String(error) })
  await stop()
  process.exit(1)
})
