import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/server/index.js'

describe('SPA fallback without a Web build', () => {
  it('UX-002: returns an actionable 503 instead of a sendFile error', async () => {
    const app = createApp('/definitely/missing/web-build')
    const res = await request(app).get('/')
    expect(res.status).toBe(503)
    expect(res.text).toContain('Web UI is not built')
    expect(res.text).toContain('npm run build')
  })
})
