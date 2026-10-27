import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createSourceImageClient } from '@integrations/source-image-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('node:https', () => ({ request }))
// A separate Node process has no Vitest https mock or process-level error handlers.
// Only the socket destination is replaced: production pinnedFetch receives a real
// IncomingMessage, while the allowed source URL and validated public DNS stay intact.
const nativeProbe = String.raw`
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer, IncomingMessage, request as httpRequest } from 'node:http'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'

const mode = process.argv[1]
const sourceUrl = 'https://cdn5.telesco.pe/file/promo.jpg'
let requests = 0, nativeResponses = 0, sentBytes = 0, socketClosed = false
let nativeSocket
let resolveClosed
const closed = new Promise(resolve => { resolveClosed = resolve })
const sockets = new Set()
const server = createServer((_req, res) => {
  if (mode === 'aborted-headers') {
    // Close a real HTTP response midway through its headers, before the callback.
    res.socket.end('HTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\n')
    return
  }
  res.writeHead(/^\d+$/.test(mode) ? Number(mode) : 200, { 'content-type': 'image/jpeg' })
  res.flushHeaders()
  const interval = setInterval(() => {
    sentBytes += 1024
    res.write(Buffer.alloc(1024, 255))
  }, 2)
  res.once('close', () => clearInterval(interval))
})
server.on('connection', socket => {
  sockets.add(socket)
  socket.once('close', () => {
    sockets.delete(socket)
    socketClosed = true
    resolveClosed()
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const original = https.request
const originalToWeb = Readable.toWeb
const originalResponse = globalThis.Response
https.request = (url, options, callback) => {
  requests++
  assert.equal(url.href, sourceUrl)
  assert.equal(options.family, 4)
  assert.equal(options.agent, false)
  assert.equal(options.rejectUnauthorized, undefined)
  options.lookup(url.hostname, {}, (error, address, family) => {
    assert.equal(error, null)
    assert.equal(address, '149.154.167.99')
    assert.equal(family, 4)
  })
  return httpRequest({ hostname: '127.0.0.1', port: server.address().port,
    path: url.pathname, method: options.method, signal: options.signal,
    headers: options.headers, agent: false }, incoming => {
    assert.ok(incoming instanceof IncomingMessage)
    nativeResponses++
    nativeSocket = incoming.socket
    // Fault injection on the real native response, never a replacement callback.
    if (mode === 'undefined-status') incoming.statusCode = undefined
    if (mode === 'fractional-status') incoming.statusCode = 200.5
    if (mode === 'nan-status') incoming.statusCode = NaN
    if (mode === 'low-status') incoming.statusCode = 199
    if (mode === 'header' || mode === 'late-error') incoming.headers['bad name'] = 'inert'
    if (mode === 'header-getter') Object.defineProperty(incoming, 'headers', {
      get() { throw new Error('synthetic native header conversion failure') },
    })
    if (mode === 'body') Readable.toWeb = () => {
      throw new Error('synthetic native body conversion failure')
    }
    if (mode === 'response') globalThis.Response = class extends originalResponse {
      constructor() { throw new Error('synthetic Response conversion failure') }
    }
    callback(incoming)
    if (mode === 'late-error') setImmediate(() => {
      incoming.emit('error', new Error('synthetic late native error after failed conversion'))
    })
  })
}
syncBuiltinESMExports()
const source = pathToFileURL(process.cwd() + '/packages/integrations/src/source-image-client.ts')
try {
  const { createSourceImageClient } = await import(source)
  let rejection
  try {
    await createSourceImageClient({ timeoutMs: 500, maxBytes: 32,
      resolveHost: async () => [{ address: '149.154.167.99', family: 4 }],
    }).fetchImage(sourceUrl, { source: 'telegram' })
  } catch (error) { rejection = { name: error.name, code: error.code, message: error.message } }
  const sentAtRejection = sentBytes
  const readAtRejection = nativeSocket?.bytesRead ?? 0
  if (nativeSocket) assert.equal(nativeSocket.destroyed, true, 'destroy before caller rejection')
  // The socket must close without relying on the now-cleared operation deadline.
  let timer
  try {
    await Promise.race([closed, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('socket still open after rejection')), 120)
    })])
  } finally { clearTimeout(timer) }
  await new Promise(resolve => setTimeout(resolve, 30))
  const expectedCode = mode === '304' ? 'HTTP_ERROR' :
    mode === 'aborted-headers' ? 'NETWORK_ERROR' : 'MALFORMED_RESPONSE'
  assert.deepEqual(rejection, { name: 'SourceClientError', code: expectedCode,
    message: 'Source request failed: ' + expectedCode })
  assert.equal(requests, mode === 'aborted-headers' ? 2 : 1,
    'only genuine pre-response network failures may retry')
  assert.equal(nativeResponses, mode === 'aborted-headers' ? 0 : 1)
  assert.equal(socketClosed, true)
  assert.equal(sockets.size, 0, 'every owned socket must close')
  const postRejectionBytesRead = (nativeSocket?.bytesRead ?? 0) - readAtRejection
  assert.equal(postRejectionBytesRead, 0, 'must not read native socket data after rejection')
  assert.ok(sentBytes - sentAtRejection <= 1024, 'must not keep draining after rejection')
  console.log(JSON.stringify({ mode, requests, nativeResponses, socketClosed,
    sentAtRejection, sentBytes, postRejectionBytesRead, rejection, source: source.href,
    sha256: createHash('sha256').update(await readFile(source)).digest('hex') }))
} finally {
  https.request = original
  Readable.toWeb = originalToWeb
  globalThis.Response = originalResponse
  syncBuiltinESMExports()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  assert.equal(server.listening, false)
}
`
const runNativeProbe = async (mode: string) => {
  const result = await promisify(execFile)(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', nativeProbe, mode],
    {
      cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      env: { PATH: process.env.PATH, HOME: tmpdir(), TMPDIR: tmpdir(), NODE_ENV: 'test' },
      timeout: 5_000,
      maxBuffer: 64 * 1024,
    },
  )
  expect(result.stderr).toBe('')
  const receipt = JSON.parse(result.stdout)
  expect(receipt).toMatchObject({
    mode,
    requests: mode === 'aborted-headers' ? 2 : 1,
    nativeResponses: mode === 'aborted-headers' ? 0 : 1,
    socketClosed: true,
  })
  expect(receipt.sha256).toMatch(/^[a-f0-9]{64}$/)
}

const url = 'https://cdn5.telesco.pe/file/promo.jpg'
const resolveHost = async () => [
  { address: '2606:4700:4700::1111', family: 6 },
  { address: '149.154.167.99', family: 4 },
]

describe('production image transport with real loopback IncomingMessage', () => {
  it('contains status 600 without crashing, retrying or leaving the socket open', async () => {
    await runNativeProbe('600')
  })
  it('closes a streaming 205 immediately instead of draining after rejection', async () => {
    await runNativeProbe('205')
  })
  it('retains bounded network retries for genuinely aborted response headers', async () => {
    await runNativeProbe('aborted-headers')
  })
  it.each(['204', '304'])(
    'terminates null-body status %s while preserving its error classification',
    async (mode) => runNativeProbe(mode),
  )
  it.each([
    'undefined-status',
    'fractional-status',
    'nan-status',
    'low-status',
    'header',
    'header-getter',
    'body',
    'response',
    'late-error',
  ])('contains native %s conversion faults without retry and closes the socket', async (mode) => {
    await runNativeProbe(mode)
  })
})

describe('production image transport DNS pinning (mocked node:https socket)', () => {
  beforeEach(() => request.mockReset())
  it('pins a validated public address/family without changing URL/SNI or certificate policy', async () => {
    const bytes = new Uint8Array([255, 216, 255, 224, 0, 16, 255, 217])
    let pinned: unknown[] | undefined
    request.mockImplementation((_url, options, onResponse) => {
      const emitter = new EventEmitter()
      return Object.assign(emitter, {
        end: () => {
          options.lookup('cdn5.telesco.pe', {}, (...args: unknown[]) => {
            pinned = args
          })
          onResponse(
            Object.assign(Readable.from([bytes]), {
              statusCode: 200,
              headers: { 'content-type': 'image/jpeg' },
            }),
          )
        },
      })
    })
    const result = await createSourceImageClient({ resolveHost }).fetchImage(url, {
      source: 'telegram',
    })
    expect(result.bytes).toEqual(bytes)
    expect(pinned).toEqual([null, '149.154.167.99', 4])
    expect(String(request.mock.calls[0]?.[0])).toBe(url)
    const options = request.mock.calls[0]?.[1]
    expect(options).toMatchObject({
      family: 4,
      agent: false,
      method: 'GET',
      headers: { 'Accept-Encoding': 'identity' },
    })
    expect(options).not.toHaveProperty('rejectUnauthorized')
    expect(options.headers).not.toHaveProperty('Authorization')
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('never retries certificate policy failures or disables TLS validation', async () => {
    request.mockImplementation(() => {
      const emitter = new EventEmitter()
      return Object.assign(emitter, {
        end: () =>
          emitter.emit(
            'error',
            Object.assign(new Error('synthetic certificate failure'), { code: 'CERT_HAS_EXPIRED' }),
          ),
      })
    })
    await expect(
      createSourceImageClient({ resolveHost }).fetchImage(url, { source: 'telegram' }),
    ).rejects.toThrow(/UNSAFE_URL/)
    expect(request).toHaveBeenCalledTimes(1)
  })
})
