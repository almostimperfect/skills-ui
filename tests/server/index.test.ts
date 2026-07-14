import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/server/index.js'

describe('SPA fallback without a Web build', () => {
  it('returns actionable 503 guidance', async () => {
    const app = createApp('/definitely/missing/web-build')
    const res = await request(app).get('/')
    expect(res.status).toBe(503)
    expect(res.text).toContain('Web UI is not built')
    expect(res.text).toContain('npm run build')
  })
})
