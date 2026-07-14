import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getSkill, removeSkill, unregisterProject } from '../../src/web/api.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Web API error handling', () => {
  it('extracts a JSON error message and retains status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Skill not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    )))

    const error = await getSkill('ghost').catch(value => value)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(404)
    expect(error.message).toBe('Skill not found')
  })

  it('uses plain response text without exposing a raw status prefix', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Service unavailable', { status: 503 })))

    const error = await unregisterProject('/project').catch(value => value)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(503)
    expect(error.message).toBe('Service unavailable')
  })

  it('uses JSON errors for DELETE requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Cannot remove this asset' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    )))

    await expect(removeSkill('asset-id')).rejects.toMatchObject({
      status: 409,
      message: 'Cannot remove this asset',
    })
  })
})
