import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  getProjects,
  getSkill,
  getSkills,
  removeSkill,
  splitGlobalSkill,
  unregisterProject,
} from '../../src/web/api.js'
import {
  CSRF_HEADER,
  SESSION_REQUIRED_HEADER,
  resetLocalSession,
} from '../../src/web/session.js'

const sessionResponse = (csrfToken = 'session-token') => new Response(
  JSON.stringify({ csrfToken }),
  { status: 200, headers: { 'Content-Type': 'application/json' } },
)

const jsonResponse = (body: unknown, status = 200, headers?: HeadersInit) => new Response(
  JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json', ...headers } },
)

afterEach(() => {
  resetLocalSession()
  vi.unstubAllGlobals()
})

describe('Web API local-session boundary', () => {
  it('deduplicates session bootstrap across concurrent reads', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (input === '/api/session') return sessionResponse()
      if (input === '/api/skills') return jsonResponse([])
      if (input === '/api/projects') return jsonResponse([])
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await Promise.all([getSkills(), getProjects()])

    expect(fetchMock.mock.calls.filter(([input]) => input === '/api/session')).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('uses a no-store, same-origin bootstrap and protects read requests', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse('read-token'))
      .mockResolvedValueOnce(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await getSkills()

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/session', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
    })
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/api/skills')
    expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store' })
    expect(new Headers(init.headers).get(CSRF_HEADER)).toBe('read-token')
    expect(new Headers(init.headers).has('Content-Type')).toBe(false)
  })

  it('adds the session proof and JSON content type to empty-body mutations', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse('write-token'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await splitGlobalSkill('asset/id')

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/api/skills/asset%2Fid/split-global')
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store' })
    const headers = new Headers(init.headers)
    expect(headers.get(CSRF_HEADER)).toBe('write-token')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('refreshes a rejected session and retries a mutation exactly once', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse('expired-token'))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: 'Local UI session required' }),
        { status: 403, headers: { [SESSION_REQUIRED_HEADER]: '1' } },
      ))
      .mockResolvedValueOnce(sessionResponse('fresh-token'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await removeSkill('asset-id')

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/session')
    expect(fetchMock.mock.calls[2][0]).toBe('/api/session')
    expect(new Headers((fetchMock.mock.calls[1][1] as RequestInit).headers).get(CSRF_HEADER))
      .toBe('expired-token')
    expect(new Headers((fetchMock.mock.calls[3][1] as RequestInit).headers).get(CSRF_HEADER))
      .toBe('fresh-token')
  })

  it('does not retry more than once when the refreshed session is rejected', async () => {
    const sessionRequired = () => new Response(
      JSON.stringify({ error: 'Local UI session required' }),
      { status: 403, headers: { [SESSION_REQUIRED_HEADER]: '1' } },
    )
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse('expired-token'))
      .mockResolvedValueOnce(sessionRequired())
      .mockResolvedValueOnce(sessionResponse('still-invalid-token'))
      .mockResolvedValueOnce(sessionRequired())
    vi.stubGlobal('fetch', fetchMock)

    await expect(removeSkill('asset-id')).rejects.toMatchObject({
      status: 403,
      message: 'Local UI session required',
    })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('does not refresh or retry an ordinary business authorization error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(jsonResponse({ error: 'Cannot remove this asset' }, 403))
    vi.stubGlobal('fetch', fetchMock)

    await expect(removeSkill('asset-id')).rejects.toMatchObject({
      status: 403,
      message: 'Cannot remove this asset',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('surfaces bootstrap failures as ApiError without sending the intended request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(
      { error: 'Local session unavailable' },
      503,
    ))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getSkills()).rejects.toMatchObject({
      status: 503,
      message: 'Local session unavailable',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('Web API error handling', () => {
  it('extracts a JSON error message and retains status', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(jsonResponse({ error: 'Skill not found' }, 404)))

    const error = await getSkill('ghost').catch(value => value)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(404)
    expect(error.message).toBe('Skill not found')
  })

  it('uses plain response text without exposing a raw status prefix', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(new Response('Service unavailable', { status: 503 })))

    const error = await unregisterProject('/project').catch(value => value)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(503)
    expect(error.message).toBe('Service unavailable')
  })

  it('uses JSON errors for DELETE requests', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(jsonResponse({ error: 'Cannot remove this asset' }, 409)))

    await expect(removeSkill('asset-id')).rejects.toMatchObject({
      status: 409,
      message: 'Cannot remove this asset',
    })
  })
})
