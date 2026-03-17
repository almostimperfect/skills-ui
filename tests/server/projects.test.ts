// tests/server/projects.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

const mockRegistry = {
  listProjects: vi.fn(),
  getProject: vi.fn(),
  registerProject: vi.fn(),
  updateProject: vi.fn(),
  unregisterProject: vi.fn(),
}
const mockStateManager = {
  getDisabled: vi.fn().mockResolvedValue({}),
  isDisabled: vi.fn().mockResolvedValue(false),
  cleanupProject: vi.fn().mockResolvedValue(undefined),
  disable: vi.fn(),
  enable: vi.fn(),
  cleanupSkill: vi.fn(),
}

vi.mock('../../src/core/projects.js', () => ({
  createProjectRegistry: vi.fn(() => mockRegistry),
}))
vi.mock('../../src/core/state.js', () => ({
  createStateManager: vi.fn(() => mockStateManager),
}))
vi.mock('../../src/core/skills-cli.js', () => ({
  listSkills: vi.fn().mockResolvedValue([]),
  addSkill: vi.fn(),
  removeSkill: vi.fn(),
}))
vi.mock('../../src/core/metadata.js', () => ({
  parseSkillMetadata: vi.fn(),
}))
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    access: vi.fn().mockResolvedValue(undefined),
  }
})

import { createApp } from '../../src/server/index.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/projects', () => {
  it('returns registered projects', async () => {
    mockRegistry.listProjects.mockResolvedValue([
      { path: '/home/user/proj', name: 'proj', agents: ['claude-code'] },
    ])
    const app = createApp()
    const res = await request(app).get('/api/projects')
    expect(res.status).toBe(200)
    expect(res.body[0].name).toBe('proj')
  })
})

describe('POST /api/projects', () => {
  it('registers a project and returns 201', async () => {
    const proj = { path: '/home/user/proj', name: 'proj', agents: ['claude-code'] }
    mockRegistry.registerProject.mockResolvedValue(proj)
    const app = createApp()
    const res = await request(app).post('/api/projects').send({ path: '/home/user/proj' })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('proj')
  })

  it('returns 400 when path is missing', async () => {
    const app = createApp()
    const res = await request(app).post('/api/projects').send({})
    expect(res.status).toBe(400)
  })

  it('returns 400 when path is relative', async () => {
    const app = createApp()
    const res = await request(app).post('/api/projects').send({ path: 'relative/path' })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/projects/:projectPath', () => {
  it('unregisters project and cleans up state', async () => {
    mockRegistry.unregisterProject.mockResolvedValue(undefined)
    const app = createApp()
    const encoded = encodeURIComponent('/home/user/proj')
    const res = await request(app).delete(`/api/projects/${encoded}`)
    expect(res.status).toBe(204)
    expect(mockStateManager.cleanupProject).toHaveBeenCalledWith('/home/user/proj')
  })
})

describe('GET /api/projects/:projectPath', () => {
  it('returns project with skill matrix', async () => {
    const proj = { path: '/home/user/proj', name: 'proj', agents: ['claude-code'] }
    mockRegistry.getProject.mockResolvedValue(proj)

    const { listSkills } = await import('../../src/core/skills-cli.js')
    ;(listSkills as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'tdd-workflow', description: '', source: '' },
    ])
    mockStateManager.isDisabled.mockResolvedValue(false)

    const app = createApp()
    const encoded = encodeURIComponent('/home/user/proj')
    const res = await request(app).get(`/api/projects/${encoded}`)
    expect(res.status).toBe(200)
    expect(res.body.matrix['tdd-workflow']['claude-code']).toBe('enabled')
  })

  it('returns 404 for unknown project', async () => {
    mockRegistry.getProject.mockResolvedValue(undefined)
    const app = createApp()
    const encoded = encodeURIComponent('/unknown/path')
    const res = await request(app).get(`/api/projects/${encoded}`)
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/projects/:projectPath', () => {
  it('updates project name', async () => {
    const updated = { path: '/home/user/proj', name: 'new-name', agents: ['claude-code'] }
    mockRegistry.updateProject.mockResolvedValue(updated)
    const app = createApp()
    const encoded = encodeURIComponent('/home/user/proj')
    const res = await request(app).patch(`/api/projects/${encoded}`).send({ name: 'new-name' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('new-name')
  })
})
