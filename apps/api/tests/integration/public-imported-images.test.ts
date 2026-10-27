import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import {
  registerSyntheticOutletFixtureDatabase,
  seedSyntheticOutletProof,
  seedSyntheticScope,
} from '@api/../tests/fixtures/outlet-proof'
import { parseConfig } from '@api/config'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

// Real anonymous HTTP + disposable loopback Mongo; synthetic media metadata only.
// No .env loading, schema push, live DB, cloud storage, provider requests or publication.
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let baseURL = ''
let venueId = ''
let publicId = ''
const url = 'https://media.example.test/approved-poster.jpg'
const altText = 'Synthetic approved lunch poster'
const hash = 'b'.repeat(64)

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`public_media_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  db = (await import('@broke-oclock/db')).db
  registerSyntheticOutletFixtureDatabase(db, databaseUrl)
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No disposable HTTP address')
  baseURL = `http://127.0.0.1:${address.port}`
  server.on(
    'request',
    createApp(
      parseConfig({
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: 'test-only-shared-secret-at-least-32-characters',
        BETTER_AUTH_URL: baseURL,
        WEB_ORIGIN: 'http://localhost:5173',
      }),
    ),
  )
  const merchant = await db.merchant.create({ data: { name: 'Synthetic media merchant' } })
  const venue = await db.venue.create({
    data: {
      name: 'Synthetic media outlet',
      address: '1 Example Street',
      merchantId: merchant.id,
      latitude: 1.32,
      longitude: 103.93,
    },
  })
  venueId = venue.id
  const source = await db.importSource.create({
    data: {
      provider: 'WORDPRESS',
      externalId: 'synthetic-media',
      name: 'Private synthetic citation',
      url: 'https://source.example.test/private',
    },
  })
  const post = await db.importedPost.create({
    data: {
      sourceId: source.id,
      externalId: 'synthetic-post',
      url: source.url,
      rawContent:
        'Private source content; SYNTHETIC unconditional offer at all merchant outlets, valid 1 October 2026 through 31 December 2026.',
      contentHash: 'content-v1',
    },
  })
  await db.importedImage.create({
    data: {
      id: hash,
      status: 'HOSTED',
      hostedUrl: url,
      storageKey: 'private-storage-key',
      mimeType: 'image/jpeg',
      sizeBytes: 1234,
    },
  })
  const deal = await db.deal.create({
    data: {
      title: 'Approved synthetic media offer',
      description: 'Synthetic offer',
      category: 'FOOD',
      cuisine: 'JAPANESE',
      offerType: 'OTHER',
      applicability: 'ALL_MERCHANT_OUTLETS',
      origin: 'IMPORTED',
      merchantId: merchant.id,
      reviewStatus: 'APPROVED',
      contentVersion: 1,
      reviewedVersion: 1,
      publishedAt: new Date(),
      // Supported ongoing image positive; unknown-bound coverage remains separate below.
      validFrom: new Date('2026-10-01T00:00:00.000Z'),
      validUntil: new Date('2027-01-01T00:00:00.000Z'),
      sources: {
        create: {
          importedPostId: post.id,
          sourceContentHash: post.contentHash,
          sourceContentSnapshot: post.rawContent,
          sourceUrl: source.url,
          images: {
            create: {
              imageId: hash,
              sourceUrl: 'https://source.example.test/original.jpg',
              finalUrl: 'https://source.example.test/final.jpg',
              altText,
            },
          },
        },
      },
    },
  })
  publicId = deal.id
  await seedSyntheticOutletProof(db, venue.id)
  await seedSyntheticScope(db, deal.id, 'SOURCE_ALL')
})

afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  expect(server?.listening ?? false).toBe(false)
  expect(mongo?.state).toBe('stopped')
  console.info('Disposable public-media HTTP and Mongo stopped; Prisma disconnected.')
  vi.unstubAllEnvs()
})

// Existing archive-read support: do not import downloader MIME/size limits into reads.
it.each(['missing', 'null'] as const)(
  'holds the original date-unknown imported image fixture out of ongoing cards: %s bounds',
  async (mode) => {
    const image = await db.importedImage.findUniqueOrThrow({ where: { id: hash } })
    await db.deal.update({
      where: { id: publicId },
      data:
        mode === 'missing'
          ? { validFrom: { unset: true }, validUntil: { unset: true } }
          : { validFrom: null, validUntil: null },
    })
    try {
      for (const path of ['/api/deals', `/api/venues/${venueId}`]) {
        const response = await fetch(`${baseURL}${path}`)
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.items ?? body.deals).toEqual([])
        expect(JSON.stringify(body)).not.toContain(url)
      }
      expect(await db.importedImage.findUniqueOrThrow({ where: { id: hash } })).toEqual(image)
    } finally {
      await db.deal.update({
        where: { id: publicId },
        data: {
          validFrom: new Date('2026-10-01T00:00:00.000Z'),
          validUntil: new Date('2027-01-01T00:00:00.000Z'),
        },
      })
    }
  },
)

it('projects a hosted GIF with 5939727-byte metadata without relabeling or URL conversion', async () => {
  const gifUrl = 'https://media.example.test/archive.gif'
  await db.importedImage.update({
    where: { id: hash },
    data: { hostedUrl: gifUrl, mimeType: 'image/gif', sizeBytes: 5_939_727 },
  })
  try {
    for (const path of ['/api/deals', `/api/venues/${venueId}`]) {
      const response = await fetch(`${baseURL}${path}`)
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(
        (body.items ?? body.deals).find((item: { id: string }) => item.id === publicId),
      ).toMatchObject({ imageUrl: gifUrl, imageAltText: altText })
    }
    expect(
      await db.importedImage.findUnique({
        where: { id: hash },
        select: { mimeType: true, sizeBytes: true },
      }),
    ).toEqual({ mimeType: 'image/gif', sizeBytes: 5_939_727 })
  } finally {
    await db.importedImage.update({
      where: { id: hash },
      data: { hostedUrl: url, mimeType: 'image/jpeg', sizeBytes: 1234 },
    })
  }
})

it.each([
  { hostedUrl: 'javascript:alert(1)', mimeType: 'image/jpeg' },
  { hostedUrl: 'http://media.example.test/insecure.jpg', mimeType: 'image/jpeg' },
  { hostedUrl: 'https://user:secret@media.example.test/credentialed.jpg', mimeType: 'image/jpeg' },
  { hostedUrl: url, mimeType: 'text/html' },
  { hostedUrl: url, mimeType: 'image/svg+xml' },
])('never exposes unusable imported-image metadata: %j', async (metadata) => {
  await db.importedImage.update({ where: { id: hash }, data: metadata })
  try {
    for (const path of ['/api/deals', `/api/venues/${venueId}`]) {
      const response = await fetch(`${baseURL}${path}`)
      expect(response.status).toBe(200)
      const body = await response.json()
      const deals = body.items ?? body.deals
      const visible = deals.find((item: { id: string }) => item.id === publicId)
      expect(visible.imageUrl).toBeNull()
      if (path === '/api/deals') expect(visible.images).toEqual([])
    }
  } finally {
    await db.importedImage.update({
      where: { id: hash },
      data: { hostedUrl: url, mimeType: 'image/jpeg' },
    })
  }
})

// Characterization: published/current approval and hosted status gates remain intact.
it.each(['UNKNOWN', 'DOWNLOADED_ONLY', 'FAILED', 'future-state'])(
  'does not expose a hosted URL with %s status',
  async (status) => {
    await db.importedImage.update({ where: { id: hash }, data: { status } })
    try {
      for (const path of ['/api/deals', `/api/venues/${venueId}`]) {
        const response = await fetch(`${baseURL}${path}`)
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(
          (body.items ?? body.deals).find((item: { id: string }) => item.id === publicId).imageUrl,
        ).toBeNull()
      }
    } finally {
      await db.importedImage.update({ where: { id: hash }, data: { status: 'HOSTED' } })
    }
  },
)

it.each([
  { reviewStatus: 'PENDING' as const },
  { reviewStatus: 'REJECTED' as const },
  { contentVersion: 2 },
  { publishedAt: null },
  { deletedAt: new Date() },
])('does not expose images or deal data when visibility is withdrawn: %j', async (data) => {
  await db.deal.update({ where: { id: publicId }, data })
  try {
    for (const path of ['/api/deals', `/api/venues/${venueId}`]) {
      const response = await fetch(`${baseURL}${path}`)
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.items ?? body.deals).toEqual([])
      expect(JSON.stringify(body)).not.toContain(url)
    }
  } finally {
    await db.deal.update({
      where: { id: publicId },
      data: {
        reviewStatus: 'APPROVED',
        contentVersion: 1,
        publishedAt: new Date(),
        deletedAt: null,
      },
    })
  }
})

it('projects imported posters on anonymous venue cards while retaining the public gate', async () => {
  const response = await fetch(`${baseURL}/api/venues/${venueId}`)
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.deals.find((item: { id: string }) => item.id === publicId)).toMatchObject({
    imageUrl: url,
    imageAltText: altText,
  })
  expect(JSON.stringify(body)).not.toContain('private-storage-key')
  expect(JSON.stringify(body)).not.toContain('https://source.example.test')
})

it('projects the approved hosted imported image into anonymous deals without private provenance or UploadedFile ownership', async () => {
  const response = await fetch(`${baseURL}/api/deals`)
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.items.find((item: { id: string }) => item.id === publicId)).toMatchObject({
    imageUrl: url,
    imageAltText: altText,
    cuisine: 'JAPANESE',
    images: [{ url, alt: altText }],
  })
  const serialized = JSON.stringify(body)
  for (const privateValue of [
    hash,
    'private-storage-key',
    'Private source content',
    'https://source.example.test',
  ])
    expect(serialized).not.toContain(privateValue)
  expect(await db.uploadedFile.count()).toBe(0)
  expect(await db.importedImage.count()).toBe(1)
})

it('reads legacy nullable finalUrl without rewriting literal original HTTP attribution', async () => {
  const link = await db.dealSourceImage.findFirstOrThrow({ where: { imageId: hash } })
  await db.dealSourceImage.update({
    where: { id: link.id },
    data: { sourceUrl: 'http://source.example.test/literal-original.jpg', finalUrl: null },
  })
  const before = await db.dealSourceImage.findUniqueOrThrow({ where: { id: link.id } })
  try {
    const response = await fetch(`${baseURL}/api/deals`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.items.find((item: { id: string }) => item.id === publicId)).toMatchObject({
      cuisine: 'JAPANESE',
      imageUrl: url,
      imageAltText: altText,
      images: [{ url, alt: altText }],
    })
    expect(JSON.stringify(body)).not.toContain(before.sourceUrl)
    expect(await db.dealSourceImage.findUniqueOrThrow({ where: { id: link.id } })).toEqual(before)
  } finally {
    await db.dealSourceImage.update({
      where: { id: link.id },
      data: { sourceUrl: link.sourceUrl, finalUrl: link.finalUrl },
    })
  }
})

it.each(['geographyEvidence', 'occupancyEvidence'] as const)(
  'requires independent current %s before exposing public media',
  async (field) => {
    const original = await db.venue.findUniqueOrThrow({ where: { id: venueId } })
    for (const missing of [false, true]) {
      await db.venue.update({
        where: { id: venueId },
        data: { [field]: missing ? { unset: true } : null },
      })
      try {
        const mapResponse = await fetch(`${baseURL}/api/deals`)
        expect(mapResponse.status).toBe(200)
        expect(await mapResponse.json()).toMatchObject({ items: [], categories: [] })
        expect((await fetch(`${baseURL}/api/venues/${venueId}`)).status).toBe(404)
      } finally {
        await db.venue.update({ where: { id: venueId }, data: { [field]: original[field] } })
      }
    }
  },
)

it.each(['missing', 'null', 'stale'] as const)(
  'requires current campaign scope independently of catalogue proof: %s',
  async (mode) => {
    const original = await db.deal.findUniqueOrThrow({ where: { id: publicId } })
    if (!original.scopeConfirmation) throw new Error('Missing positive synthetic scope')
    await db.deal.update({
      where: { id: publicId },
      data: {
        scopeConfirmation:
          mode === 'missing'
            ? { unset: true }
            : mode === 'null'
              ? null
              : { ...original.scopeConfirmation, contentVersion: 2 },
      },
    })
    try {
      const mapResponse = await fetch(`${baseURL}/api/deals`)
      expect(mapResponse.status).toBe(200)
      expect(await mapResponse.json()).toMatchObject({ items: [], categories: [] })
      const venueResponse = await fetch(`${baseURL}/api/venues/${venueId}`)
      expect(venueResponse.status).toBe(200)
      expect(await venueResponse.json()).toMatchObject({ deals: [] })
    } finally {
      await db.deal.update({
        where: { id: publicId },
        data: { scopeConfirmation: original.scopeConfirmation },
      })
    }
  },
)

it('hashes complete selected edges including deleted outlets before filtering the displayed map population', async () => {
  const original = await db.deal.findUniqueOrThrow({ where: { id: publicId } })
  if (!original.merchantId || !original.scopeConfirmation)
    throw new Error('Missing synthetic campaign')
  const deleted = await db.venue.create({
    data: {
      merchantId: original.merchantId,
      name: 'Synthetic deleted edge',
      address: '2 Example Street',
      latitude: 1.33,
      longitude: 103.94,
      deletedAt: new Date(),
    },
  })
  try {
    await db.deal.update({
      where: { id: publicId },
      data: { applicability: 'SELECTED_OUTLETS', venues: { create: { venueId } } },
    })
    await seedSyntheticScope(db, publicId, 'SOURCE_SELECTED')
    await db.dealVenue.create({ data: { dealId: publicId, venueId: deleted.id } })
    const held = await fetch(`${baseURL}/api/deals`)
    expect(held.status).toBe(200)
    expect(await held.json()).toMatchObject({ items: [], categories: [] })
    await seedSyntheticScope(db, publicId, 'SOURCE_SELECTED')
    const restored = await fetch(`${baseURL}/api/deals`)
    expect(restored.status).toBe(200)
    const body = await restored.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].venues.map((venue: { id: string }) => venue.id)).toEqual([venueId])
    expect(body.items[0].images).toEqual([{ url, alt: altText }])
  } finally {
    await db.dealVenue.deleteMany({ where: { dealId: publicId } })
    await db.deal.update({
      where: { id: publicId },
      data: {
        applicability: original.applicability,
        scopeConfirmation: original.scopeConfirmation,
      },
    })
    await db.venue.delete({ where: { id: deleted.id } })
  }
})
