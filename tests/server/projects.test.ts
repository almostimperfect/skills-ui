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
const mockInventory = {
  reconcile: vi.fn().mockResolvedValue({ skills: {} }),
  listSkills: vi.fn().mockResolvedValue([]),
}

vi.mock('../../src/core/projects.js', () => ({
  createProjectRegistry: vi.fn(() => mockRegistry),
}))
vi.mock('../../src/core/inventory.js', () => ({
  createInventoryManager: vi.fn(() => mockInventory),
}))
vi.mock('../../src/core/skills-cli.js', () => ({
  addSkill: vi.fn(),
  SkillsCliError: class SkillsCliError extends Error {},
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
  mockInventory.listSkills.mockResolvedValue([])
  mockInventory.reconcile.mockResolvedValue({ skills: {} })
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
    expect(mockInventory.reconcile).toHaveBeenCalled()
  })
})

describe('GET /api/projects/:projectPath', () => {
  it('returns project with skill matrix', async () => {
    const proj = { path: '/home/user/proj', name: 'proj', agents: ['claude-code'] }
    mockRegistry.getProject.mockResolvedValue(proj)
    mockRegistry.listProjects.mockResolvedValue([proj])
    mockInventory.listSkills.mockResolvedValue([
      {
        id: 'tdd-workflow-1',
        name: 'tdd-workflow',
        description: '',
        source: 'owner/repo',
        reinstallSource: 'owner/repo',
        reinstallable: true,
        sourceType: 'github',
        instances: [
          {
            scope: 'project',
            projectPath: '/home/user/proj',
            path: '/home/user/proj/.claude/skills/tdd-workflow',
            agents: ['Claude Code'],
          },
        ],
      },
    ])

    const app = createApp()
    const encoded = encodeURIComponent('/home/user/proj')
    const res = await request(app).get(`/api/projects/${encoded}`)
    expect(res.status).toBe(200)
    expect(res.body.skills[0].id).toBe('tdd-workflow-1')
    expect(res.body.skills[0].status['claude-code'].state).toBe('project')
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
