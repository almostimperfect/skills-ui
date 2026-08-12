import { once } from 'events'
import type { AddressInfo } from 'net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createApp, startServer } from '../../src/server/index.js'
import {
  CSRF_HEADER_NAME,
  SESSION_COOKIE_NAME,
  SESSION_REQUIRED_HEADER,
} from '../../src/server/session-boundary.js'
import { authenticatedRequest, TEST_AUTHORITY, TEST_ORIGIN } from './session.js'

const servers: ReturnType<typeof startServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve())
  })))
  vi.restoreAllMocks()
})

describe('local HTTP service boundary', () => {
  it('binds only the IPv4 loopback interface', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const server = startServer(0)
    servers.push(server)
    await once(server, 'listening')

    const address = server.address() as AddressInfo
    expect(address.address).toBe('127.0.0.1')
    expect(address.family).toBe('IPv4')
    expect(address.port).toBeGreaterThan(0)
  })

  it('rejects an unexpected Host before serving health, API, or static content', async () => {
    const app = createApp()
    for (const host of [
      'localhost:3456',
      'evil.test:3456',
      '127.0.0.1.evil.test:3456',
      '127.0.0.1:9999',
      '[::1]:3456',
      `${TEST_AUTHORITY}, evil.test`,
    ]) {
      const response = await request(app).get('/healthz').set('Host', host)
      expect(response.status, host).toBe(421)
      expect(JSON.stringify(response.body)).not.toContain(TEST_AUTHORITY)
    }
  })

  it('exposes only a minimal health response with defensive headers', async () => {
    const response = await request(createApp())
      .get('/healthz')
      .set('Host', TEST_AUTHORITY)

    expect(response.status).toBe(200)
    expect(response.text).toBe('ok')
    expect(response.headers['x-powered-by']).toBeUndefined()
    expect(response.headers['x-frame-options']).toBe('DENY')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['referrer-policy']).toBe('no-referrer')
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'")
  })
})

describe('browser session bootstrap', () => {
  it('sets an in-memory session cookie and returns a separate CSRF token', async () => {
    const response = await request(createApp())
      .post('/api/session')
      .set('Host', TEST_AUTHORITY)
      .set('Origin', TEST_ORIGIN)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('Content-Type', 'application/json')
      .send({})

    expect(response.status).toBe(200)
    expect(response.body.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const cookie = response.headers['set-cookie']?.[0] ?? ''
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`)
    expect(cookie).toContain('Path=/api')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).not.toContain('Domain=')
    expect(response.headers['cache-control']).toBe('no-store')
    expect(cookie).not.toContain(response.body.csrfToken)
  })

  it.each([
    ['missing Origin', undefined, 'same-origin', 'application/json'],
    ['null Origin', 'null', 'same-origin', 'application/json'],
    ['foreign Origin', 'http://evil.test', 'same-origin', 'application/json'],
    ['lookalike Origin', 'http://127.0.0.1.evil.test:3456', 'same-origin', 'application/json'],
    ['cross-site metadata', TEST_ORIGIN, 'cross-site', 'application/json'],
    ['simple form content', TEST_ORIGIN, 'same-origin', 'text/plain'],
  ])('rejects %s', async (_name, origin, fetchSite, contentType) => {
    let test = request(createApp())
      .post('/api/session')
      .set('Host', TEST_AUTHORITY)
      .set('Sec-Fetch-Site', fetchSite)
      .set('Content-Type', contentType)
    if (origin !== undefined) test = test.set('Origin', origin)
    const response = await test.send('{}')

    expect(response.status).toBe(403)
    expect(response.headers[SESSION_REQUIRED_HEADER.toLowerCase()]).toBe('1')
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('reuses an established browser session without rotating another tab out', async () => {
    const app = createApp()
    const agent = request.agent(app)
    const bootstrap = () => agent
      .post('/api/session')
      .set('Host', TEST_AUTHORITY)
      .set('Origin', TEST_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({})

    const first = await bootstrap()
    const second = await bootstrap()
    expect(second.body.csrfToken).toBe(first.body.csrfToken)
  })

  it('rejects duplicate session cookies and a CSRF token from another session', async () => {
    const app = createApp()
    const first = await request(app)
      .post('/api/session')
      .set('Host', TEST_AUTHORITY)
      .set('Origin', TEST_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({})
    const second = await request(app)
      .post('/api/session')
      .set('Host', TEST_AUTHORITY)
      .set('Origin', TEST_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({})
    const firstCookie = (first.headers['set-cookie']?.[0] ?? '').split(';', 1)[0]
    const secondCookie = (second.headers['set-cookie']?.[0] ?? '').split(';', 1)[0]

    const mixed = await request(app)
      .get('/api/agents')
      .set('Host', TEST_AUTHORITY)
      .set('Cookie', firstCookie)
      .set(CSRF_HEADER_NAME, second.body.csrfToken)
    expect(mixed.status).toBe(403)

    const duplicate = await request(app)
      .get('/api/agents')
      .set('Host', TEST_AUTHORITY)
      .set('Cookie', `${firstCookie}; ${secondCookie}`)
      .set(CSRF_HEADER_NAME, first.body.csrfToken)
    expect(duplicate.status).toBe(401)
  })
})

describe('protected API boundary', () => {
  const unsafeRoutes = [
    ['PATCH', '/api/agents/global'],
    ['POST', '/api/overview/reconcile'],
    ['POST', '/api/projects'],
    ['PATCH', '/api/projects/%2Fsynthetic%2Fproject'],
    ['DELETE', '/api/projects/%2Fsynthetic%2Fproject'],
    ['POST', '/api/skills'],
    ['DELETE', '/api/skills/synthetic'],
    ['POST', '/api/skills/synthetic/enable'],
    ['POST', '/api/skills/synthetic/disable'],
    ['POST', '/api/skills/synthetic/split-global'],
    ['POST', '/api/skills/synthetic/update'],
    ['POST', '/api/skills/synthetic/install-global'],
    ['POST', '/api/skills/synthetic/reinstall-project'],
    ['DELETE', '/api/skills/synthetic/catalog'],
  ] as const

  it.each(unsafeRoutes)('rejects unbound %s %s before route handling', async (method, path) => {
    const response = await request(createApp())
      [method.toLowerCase() as 'post'](path)
      .set('Host', TEST_AUTHORITY)
      .set('Origin', TEST_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({})

    expect(response.status).toBe(401)
    expect(response.headers[SESSION_REQUIRED_HEADER.toLowerCase()]).toBe('1')
  })

  it('does not expose API reads without a bound session', async () => {
    const response = await request(createApp())
      .get('/api/projects')
      .set('Host', TEST_AUTHORITY)

    expect(response.status).toBe(401)
    expect(response.text).not.toContain('/synthetic')
  })

  it('rejects a wrong CSRF token, foreign Origin, and simple content types', async () => {
    const app = createApp()
    const session = await authenticatedRequest(app)

    const wrongToken = await session.post('/api/not-found').set(CSRF_HEADER_NAME, 'x'.repeat(43))
    expect(wrongToken.status).toBe(403)

    const foreignOrigin = await session.post('/api/not-found').set('Origin', 'http://evil.test')
    expect(foreignOrigin.status).toBe(403)

    const missingOrigin = await session.post('/api/not-found').unset('Origin')
    expect(missingOrigin.status).toBe(403)

    const simpleContent = await session.post('/api/not-found').set('Content-Type', 'text/plain')
    expect(simpleContent.status).toBe(403)
  })

  it('allows a correctly bound request to reach API routing', async () => {
    const session = await authenticatedRequest(createApp())
    const read = await session.get('/api/not-found')
    const write = await session.post('/api/not-found').send({})

    expect(read.status).toBe(404)
    expect(write.status).toBe(404)
  })

  it('rejects cross-origin preflight without CORS permission', async () => {
    const response = await request(createApp())
      .options('/api/projects')
      .set('Host', TEST_AUTHORITY)
      .set('Origin', 'http://evil.test')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', CSRF_HEADER_NAME)

    expect(response.status).toBe(403)
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
    expect(response.headers['access-control-allow-credentials']).toBeUndefined()
  })

  it('invalidates an old browser session when the service restarts', async () => {
    const firstApp = createApp()
    const bootstrap = await request(firstApp)
      .post('/api/session')
      .set('Host', TEST_AUTHORITY)
      .set('Origin', TEST_ORIGIN)
      .set('Content-Type', 'application/json')
      .send({})
    const cookie = (bootstrap.headers['set-cookie']?.[0] ?? '').split(';', 1)[0]

    const response = await request(createApp())
      .get('/api/agents')
      .set('Host', TEST_AUTHORITY)
      .set('Cookie', cookie)
      .set(CSRF_HEADER_NAME, bootstrap.body.csrfToken)

    expect(response.status).toBe(401)
  })
})
