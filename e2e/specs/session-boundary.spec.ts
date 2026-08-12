import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { basename, join } from 'path'

const SERVICE_ORIGIN = 'http://127.0.0.1:3456'
const CSRF_HEADER = 'X-Skills-UI-CSRF'
const SESSION_REQUIRED_HEADER = 'X-Skills-UI-Session-Required'

function testHome(): string {
  const home = process.env.HOME
  if (!home || !/^\/tmp\/skills-ui-e2e-[^/]+\/home$/.test(home)) {
    throw new Error('Session-boundary E2E tests require the disposable E2E HOME')
  }
  return home
}

async function bootstrapApiSession(api: APIRequestContext): Promise<string> {
  const response = await api.post('/api/session', {
    data: {},
    headers: {
      'Content-Type': 'application/json',
      Origin: SERVICE_ORIGIN,
    },
  })
  const responseBody = await response.text()
  expect(response.status(), responseBody).toBe(200)

  const body = JSON.parse(responseBody) as { csrfToken?: unknown }
  expect(typeof body.csrfToken).toBe('string')
  expect(body.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
  return body.csrfToken as string
}

async function projectPaths(api: APIRequestContext, csrfToken: string): Promise<string[]> {
  const response = await api.get('/api/projects', {
    headers: { [CSRF_HEADER]: csrfToken },
  })
  const responseBody = await response.text()
  expect(response.status(), responseBody).toBe(200)
  const projects = JSON.parse(responseBody) as Array<{ path?: unknown }>
  return projects
    .map(project => project.path)
    .filter((path): path is string => typeof path === 'string')
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('skills-ui.locale', 'en'))
})

test('built service listens only on the IPv4 loopback address', async () => {
  const [ipv4, ipv6] = await Promise.all([
    readFile('/proc/net/tcp', 'utf8'),
    readFile('/proc/net/tcp6', 'utf8'),
  ])
  const listeningOnPort = (table: string) => table
    .trim()
    .split('\n')
    .slice(1)
    .map(line => line.trim().split(/\s+/))
    .filter(columns => columns[1]?.endsWith(':0D80') && columns[3] === '0A')
    .map(columns => columns[1])

  expect(listeningOnPort(ipv4)).toEqual(['0100007F:0D80'])
  expect(listeningOnPort(ipv6)).toEqual([])
})

test('normal browser session survives reload and a deep-linked write workflow', async ({ page, context }) => {
  const projectPath = await mkdtemp(join(testHome(), 'session-ui-project-'))
  const projectName = basename(projectPath)
  let registered = false

  try {
    const bootstrapResponse = page.waitForResponse(response =>
      response.url() === `${SERVICE_ORIGIN}/api/session`
      && response.request().method() === 'POST'
    )

    await page.goto('/projects')
    const bootstrap = await bootstrapResponse
    expect(bootstrap.status()).toBe(200)
    expect(bootstrap.request().headers()['content-type']).toContain('application/json')

    const sessionCookies = (await context.cookies(`${SERVICE_ORIGIN}/api`)).filter(cookie =>
      cookie.path === '/api' && cookie.httpOnly && cookie.sameSite === 'Strict'
    )
    expect(sessionCookies).toHaveLength(1)

    const registrationResponse = page.waitForResponse(response =>
      response.url() === `${SERVICE_ORIGIN}/api/projects`
      && response.request().method() === 'POST'
    )
    await page.getByRole('button', { name: 'Add Project' }).click()
    await page.getByLabel('Project path').fill(projectPath)
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    const registration = await registrationResponse
    expect(registration.status(), await registration.text()).toBe(201)
    const registrationHeaders = await registration.request().allHeaders()
    expect(registrationHeaders[CSRF_HEADER.toLowerCase()]).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(registrationHeaders['content-type']).toContain('application/json')
    expect(registrationHeaders.origin).toBe(SERVICE_ORIGIN)
    registered = true

    await expect(page).toHaveURL(/\/projects$/)
    await page.reload()
    await expect(page.getByRole('link', { name: projectName })).toBeVisible()

    await page.goto(`/projects/${encodeURIComponent(projectPath)}`)
    await expect(page.getByRole('heading', { name: projectName })).toBeVisible()
    await expect(page.getByText(projectPath, { exact: true })).toBeVisible()
  } finally {
    if (registered) {
      await page.goto('/projects')
      const row = page.locator('.divide-y > div').filter({ hasText: projectPath })
      const deletionResponse = page.waitForResponse(response =>
        response.url().startsWith(`${SERVICE_ORIGIN}/api/projects/`)
        && response.request().method() === 'DELETE'
      )
      page.once('dialog', dialog => dialog.accept())
      await row.getByRole('button', { name: 'Remove' }).click()
      expect((await deletionResponse).status()).toBe(204)
    }
    await rm(projectPath, { recursive: true, force: true })
  }
})

test('unauthenticated and forged mutations are rejected without changing project state', async () => {
  const home = testHome()
  const paths = {
    unauthenticated: await mkdtemp(join(home, 'session-unauthenticated-')),
    crossOrigin: await mkdtemp(join(home, 'session-cross-origin-')),
    wrongToken: await mkdtemp(join(home, 'session-wrong-token-')),
    wrongContentType: await mkdtemp(join(home, 'session-content-type-')),
  }
  const authenticated = await playwrightRequest.newContext({ baseURL: SERVICE_ORIGIN })
  const unauthenticated = await playwrightRequest.newContext({ baseURL: SERVICE_ORIGIN })

  try {
    const unauthenticatedResponse = await unauthenticated.post('/api/projects', {
      data: { path: paths.unauthenticated, agents: ['codex'] },
      headers: {
        'Content-Type': 'application/json',
        Origin: SERVICE_ORIGIN,
      },
    })
    expect(unauthenticatedResponse.status()).toBe(401)
    expect(unauthenticatedResponse.headers()[SESSION_REQUIRED_HEADER.toLowerCase()]).toBe('1')

    const csrfToken = await bootstrapApiSession(authenticated)
    const wrongCsrfToken = `${csrfToken[0] === 'A' ? 'B' : 'A'}${csrfToken.slice(1)}`

    const crossOriginResponse = await authenticated.post('/api/projects', {
      data: { path: paths.crossOrigin, agents: ['codex'] },
      headers: {
        [CSRF_HEADER]: csrfToken,
        'Content-Type': 'application/json',
        Origin: 'http://example.invalid',
      },
    })
    expect(crossOriginResponse.status()).toBe(403)
    expect(crossOriginResponse.headers()[SESSION_REQUIRED_HEADER.toLowerCase()]).toBe('1')

    const wrongTokenResponse = await authenticated.post('/api/projects', {
      data: { path: paths.wrongToken, agents: ['codex'] },
      headers: {
        [CSRF_HEADER]: wrongCsrfToken,
        'Content-Type': 'application/json',
        Origin: SERVICE_ORIGIN,
      },
    })
    expect(wrongTokenResponse.status()).toBe(403)
    expect(wrongTokenResponse.headers()[SESSION_REQUIRED_HEADER.toLowerCase()]).toBe('1')

    const wrongContentTypeResponse = await authenticated.post('/api/projects', {
      data: JSON.stringify({ path: paths.wrongContentType, agents: ['codex'] }),
      headers: {
        [CSRF_HEADER]: csrfToken,
        'Content-Type': 'text/plain',
        Origin: SERVICE_ORIGIN,
      },
    })
    expect(wrongContentTypeResponse.status()).toBe(403)
    expect(wrongContentTypeResponse.headers()[SESSION_REQUIRED_HEADER.toLowerCase()]).toBe('1')

    const observedPaths = await projectPaths(authenticated, csrfToken)
    expect(observedPaths).not.toContain(paths.unauthenticated)
    expect(observedPaths).not.toContain(paths.crossOrigin)
    expect(observedPaths).not.toContain(paths.wrongToken)
    expect(observedPaths).not.toContain(paths.wrongContentType)
  } finally {
    await Promise.all([
      authenticated.dispose(),
      unauthenticated.dispose(),
      ...Object.values(paths).map(path => rm(path, { recursive: true, force: true })),
    ])
  }
})
