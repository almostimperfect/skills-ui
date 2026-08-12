// tests/server/agents.test.ts
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../../src/server/index.js'
import { authenticatedRequest } from './session.js'

const app = createApp()

describe('GET /api/agents', () => {
  it('returns the supported agents list', async () => {
    const session = await authenticatedRequest(app)
    const res = await session.get('/api/agents')
    expect(res.status).toBe(200)
    expect(res.body).toContain('claude-code')
    expect(res.body).toContain('codex')
    expect(res.body).toContain('gemini-cli')
    expect(res.body).toContain('antigravity')
  })
})
