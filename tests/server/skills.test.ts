// tests/server/skills.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

const mockRegistryInstance = {
  listProjects: vi.fn().mockResolvedValue([]),
  getProject: vi.fn().mockResolvedValue(undefined),
  registerProject: vi.fn(),
  updateProject: vi.fn(),
  unregisterProject: vi.fn(),
}

const mockInventoryInstance = {
  reconcile: vi.fn().mockResolvedValue({ skills: {} }),
  listSkills: vi.fn(),
  getSkill: vi.fn(),
  resolveSkillRef: vi.fn(),
  enableProjectSkill: vi.fn().mockResolvedValue(undefined),
  disableProjectSkill: vi.fn().mockResolvedValue(undefined),
  updateGlobalSkill: vi.fn().mockResolvedValue(undefined),
  removeGlobalSkill: vi.fn().mockResolvedValue(undefined),
  splitGlobalSkill: vi.fn().mockResolvedValue(undefined),
}
const mockGetSkillMaintenance = vi.fn()

vi.mock('../../src/core/skills-cli.js', () => ({
  addSkill: vi.fn(),
  SkillsCliError: class SkillsCliError extends Error {},
}))
vi.mock('../../src/core/projects.js', () => ({
  createProjectRegistry: vi.fn(() => mockRegistryInstance),
}))
vi.mock('../../src/core/inventory.js', () => ({
  createInventoryManager: vi.fn(() => mockInventoryInstance),
}))
vi.mock('../../src/core/maintenance.js', () => ({
  getSkillMaintenance: (...args: unknown[]) => mockGetSkillMaintenance(...args),
}))

import { addSkill } from '../../src/core/skills-cli.js'
import { createApp } from '../../src/server/index.js'

const mockAdd = addSkill as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockAdd.mockReset()
  mockInventoryInstance.listSkills.mockReset()
  mockInventoryInstance.getSkill.mockReset()
  mockInventoryInstance.resolveSkillRef.mockReset()
  mockInventoryInstance.enableProjectSkill.mockReset()
  mockInventoryInstance.disableProjectSkill.mockReset()
  mockInventoryInstance.updateGlobalSkill.mockReset()
  mockInventoryInstance.removeGlobalSkill.mockReset()
  mockInventoryInstance.splitGlobalSkill.mockReset()
  mockInventoryInstance.reconcile.mockReset()
  mockGetSkillMaintenance.mockReset()
  mockRegistryInstance.listProjects.mockResolvedValue([])
})

describe('GET /api/skills', () => {
  it('returns list of installed skills', async () => {
    mockInventoryInstance.listSkills.mockResolvedValue([
      { id: 'tdd-workflow-1', name: 'tdd-workflow', description: 'TDD', source: '', reinstallSource: '', reinstallable: true, sourceType: 'github', instances: [] },
    ])
    const app = createApp()
    const res = await request(app).get('/api/skills')
    expect(res.status).toBe(200)
    expect(res.body[0].name).toBe('tdd-workflow')
  })
})

describe('POST /api/skills', () => {
  it('calls addSkill and returns 201', async () => {
    mockAdd.mockResolvedValue(undefined)
    mockInventoryInstance.reconcile.mockResolvedValue({ skills: {} })
    const app = createApp()
    const res = await request(app).post('/api/skills').send({ source: 'owner/repo' })
    expect(res.status).toBe(201)
    expect(mockAdd).toHaveBeenCalledWith('owner/repo', { global: true })
  })

  it('returns 400 when source is missing', async () => {
    const app = createApp()
    const res = await request(app).post('/api/skills').send({})
    expect(res.status).toBe(400)
  })
})

describe('GET /api/skills/:name', () => {
  it('returns skill detail with status map across projects', async () => {
    mockRegistryInstance.listProjects.mockResolvedValue([
      { path: '/home/user/proj', name: 'proj', agents: ['claude-code'] },
    ])
    mockInventoryInstance.resolveSkillRef.mockResolvedValue({
      id: 'tdd-workflow-1',
      name: 'tdd-workflow',
      description: 'TDD skill',
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
    })

    const app = createApp()
    const res = await request(app).get('/api/skills/tdd-workflow')
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('tdd-workflow')
    expect(res.body.status['/home/user/proj']['claude-code'].state).toBe('project')
  })
})

describe('DELETE /api/skills/:name', () => {
  it('calls removeSkill and returns 204', async () => {
    mockInventoryInstance.removeGlobalSkill.mockResolvedValue(undefined)
    mockInventoryInstance.resolveSkillRef.mockResolvedValue({
      id: 'tdd-workflow-1',
      name: 'tdd-workflow',
      description: '',
      source: 'owner/repo',
      reinstallSource: 'owner/repo',
      reinstallable: true,
      sourceType: 'github',
      instances: [{ scope: 'global', path: '/home/user/.agents/skills/tdd-workflow', agents: [] }],
    })
    const app = createApp()
    const res = await request(app).delete('/api/skills/tdd-workflow')
    expect(res.status).toBe(204)
    expect(mockInventoryInstance.removeGlobalSkill).toHaveBeenCalledWith('tdd-workflow-1', [])
  })
})

describe('GET /api/skills/:name/maintenance', () => {
  it('returns maintenance info for a managed skill', async () => {
    mockInventoryInstance.resolveSkillRef.mockResolvedValue({
      id: 'tdd-workflow-1',
      name: 'tdd-workflow',
      description: 'TDD skill',
      source: 'owner/repo',
      reinstallSource: 'owner/repo',
      reinstallable: true,
      sourceType: 'github',
      instances: [],
    })
    mockGetSkillMaintenance.mockResolvedValue({
      update: {
        supported: true,
        status: 'up-to-date',
        checkedAt: '2026-03-23T00:00:00.000Z',
      },
      modifiedProjects: [],
    })

    const app = createApp()
    const res = await request(app).get('/api/skills/tdd-workflow/maintenance')
    expect(res.status).toBe(200)
    expect(res.body.update.status).toBe('up-to-date')
  })
})

describe('POST /api/skills/:name/update', () => {
  it('updates a managed global skill', async () => {
    mockInventoryInstance.resolveSkillRef.mockResolvedValue({
      id: 'tdd-workflow-1',
      name: 'tdd-workflow',
      description: '',
      source: 'owner/repo',
      reinstallSource: 'owner/repo',
      reinstallable: true,
      sourceType: 'github',
      instances: [{ scope: 'global', path: '/home/user/.agents/skills/tdd-workflow', agents: [] }],
    })

    const app = createApp()
    const res = await request(app).post('/api/skills/tdd-workflow/update')
    expect(res.status).toBe(200)
    expect(mockInventoryInstance.updateGlobalSkill).toHaveBeenCalledWith('tdd-workflow-1', [])
  })
})

describe('POST /api/skills/:name/split-global', () => {
  it('splits a managed global skill into project-local installs', async () => {
    mockInventoryInstance.resolveSkillRef.mockResolvedValue({
      id: 'tdd-workflow-1',
      name: 'tdd-workflow',
      description: '',
      source: 'owner/repo',
      reinstallSource: 'owner/repo',
      reinstallable: true,
      sourceType: 'github',
      instances: [{ scope: 'global', path: '/home/user/.agents/skills/tdd-workflow', agents: [] }],
    })

    const app = createApp()
    const res = await request(app).post('/api/skills/tdd-workflow/split-global')
    expect(res.status).toBe(200)
    expect(mockInventoryInstance.splitGlobalSkill).toHaveBeenCalledWith('tdd-workflow-1', [])
  })
})
