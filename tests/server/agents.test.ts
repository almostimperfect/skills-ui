// tests/server/agents.test.ts
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/server/index.js'

const app = createApp()

describe('GET /api/agents', () => {
  it('returns the supported agents list', async () => {
    const res = await request(app).get('/api/agents')
    expect(res.status).toBe(200)
    expect(res.body).toContain('claude-code')
    expect(res.body).toContain('codex')
    expect(res.body).toContain('gemini')
    expect(res.body).toContain('antigravity')
  })
})
