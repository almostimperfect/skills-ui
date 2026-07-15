// tests/server/skills.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

const { MockSkillsCliError } = vi.hoisted(() => ({
  MockSkillsCliError: class MockSkillsCliError extends Error {},
}))

const mockRegistryInstance = {
  listProjects: vi.fn().mockResolvedValue([]),
  getProject: vi.fn().mockResolvedValue(undefined),
  getGlobalAgents: vi.fn().mockResolvedValue(['codex']),
  updateGlobalAgents: vi.fn(),
  registerProject: vi.fn(),
  updateProject: vi.fn(),
  unregisterProject: vi.fn(),
}

const mockInventoryInstance = {
  reconcile: vi.fn().mockResolvedValue({ skills: {} }),
  listSkills: vi.fn(),
  getSkill: vi.fn(),
  resolveSkillRef: vi.fn(),
  addGlobalSkillFromSource: vi.fn().mockResolvedValue(undefined),
  enableProjectSkill: vi.fn().mockResolvedValue(undefined),
  installGlobalSkill: vi.fn().mockResolvedValue(undefined),
  disableProjectSkill: vi.fn().mockResolvedValue(undefined),
  updateGlobalSkill: vi.fn().mockResolvedValue(undefined),
  removeGlobalSkill: vi.fn().mockResolvedValue(undefined),
  splitGlobalSkill: vi.fn().mockResolvedValue(undefined),
  reinstallProjectSkill: vi.fn().mockResolvedValue(undefined),
  forgetSkill: vi.fn().mockResolvedValue(undefined),
}
const mockGetSkillMaintenance = vi.fn()

vi.mock('../../src/core/skills-cli.js', () => ({
  SkillsCliError: MockSkillsCliError,
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

import { createApp } from '../../src/server/index.js'

beforeEach(() => {
  mockInventoryInstance.listSkills.mockReset()
  mockInventoryInstance.getSkill.mockReset()
  mockInventoryInstance.resolveSkillRef.mockReset()
  mockInventoryInstance.addGlobalSkillFromSource.mockReset()
  mockInventoryInstance.enableProjectSkill.mockReset()
  mockInventoryInstance.installGlobalSkill.mockReset()
  mockInventoryInstance.disableProjectSkill.mockReset()
  mockInventoryInstance.updateGlobalSkill.mockReset()
  mockInventoryInstance.removeGlobalSkill.mockReset()
  mockInventoryInstance.splitGlobalSkill.mockReset()
  mockInventoryInstance.reinstallProjectSkill.mockReset()
  mockInventoryInstance.forgetSkill.mockReset()
  mockInventoryInstance.reconcile.mockReset()
  mockGetSkillMaintenance.mockReset()
  mockRegistryInstance.listProjects.mockResolvedValue([])
  mockRegistryInstance.getGlobalAgents.mockResolvedValue(['codex'])
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

describe('Skill recovery and catalog deletion', () => {
  it('reinstalls a project copy from the recorded source', async () => {
    mockRegistryInstance.listProjects.mockResolvedValue([{ path: '/synthetic/project', name: 'project', agents: ['codex'] }])
    mockInventoryInstance.resolveSkillRef.mockResolvedValue({ id: 'skill-id', name: 'skill', instances: [] })
    const res = await request(createApp()).post('/api/skills/skill-id/reinstall-project').send({ projectPath: '/synthetic/project' })
    expect(res.status).toBe(200)
    expect(mockInventoryInstance.reinstallProjectSkill).toHaveBeenCalledWith('skill-id', '/synthetic/project', expect.any(Array))
  })

  it('forgets a catalog-only Skill', async () => {
    mockInventoryInstance.resolveSkillRef.mockResolvedValue({ id: 'skill-id', name: 'skill', instances: [] })
    const res = await request(createApp()).delete('/api/skills/skill-id/catalog')
    expect(res.status).toBe(204)
    expect(mockInventoryInstance.forgetSkill).toHaveBeenCalledWith('skill-id', [])
  })
})

describe('POST /api/skills', () => {
  it('adds a global skill through inventory and returns 201', async () => {
    mockInventoryInstance.addGlobalSkillFromSource.mockResolvedValue(undefined)
    const app = createApp()
    const res = await request(app).post('/api/skills').send({ source: 'owner/repo' })
    expect(res.status).toBe(201)
    expect(mockInventoryInstance.addGlobalSkillFromSource).toHaveBeenCalledWith('owner/repo', [], ['codex'])
  })

  it('returns 400 when source is missing', async () => {
    const app = createApp()
    const res = await request(app).post('/api/skills').send({})
    expect(res.status).toBe(400)
  })

  it('does not expose CLI commands, host paths, or tokens in source errors', async () => {
    mockInventoryInstance.addGlobalSkillFromSource.mockRejectedValue(new MockSkillsCliError(
      'skills add owner/private --global failed at /synthetic/private-host/path token=synthetic-secret'
    ))

    const app = createApp()
    const res = await request(app).post('/api/skills').send({ source: 'owner/private' })
    const body = JSON.stringify(res.body)

    expect(res.status).toBe(422)
    expect(res.body.error).toBe('The Skill source could not be installed. Check the repository and network connection.')
    expect(body).not.toContain('skills add')
    expect(body).not.toContain('/synthetic/private-host')
    expect(body).not.toContain('synthetic-secret')
  })
})

describe('GET /api/skills/:name', () => {
  it('returns the canonical id when an old catalog id resolves through an alias', async () => {
    mockInventoryInstance.resolveSkillRef.mockResolvedValue({
      id: 'canonical-id',
      aliases: ['old-id'],
      name: 'continuity-skill',
      description: 'Keeps stale links valid',
      source: 'owner/repo',
      reinstallSource: 'owner/repo',
      reinstallable: true,
      sourceType: 'github',
      instances: [],
    })

    const app = createApp()
    const res = await request(app).get('/api/skills/old-id')

    expect(res.status).toBe(200)
    expect(mockInventoryInstance.resolveSkillRef).toHaveBeenCalledWith('old-id', [])
    expect(res.body.id).toBe('canonical-id')
  })

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
    expect(mockInventoryInstance.updateGlobalSkill).toHaveBeenCalledWith('tdd-workflow-1', [], ['codex'])
  })
})

describe('POST /api/skills/:name/install-global', () => {
  it('installs a known asset globally from its recorded source', async () => {
    mockInventoryInstance.resolveSkillRef.mockResolvedValue({
      id: 'tdd-workflow-1',
      name: 'tdd-workflow',
      description: '',
      source: 'owner/repo',
      reinstallSource: 'owner/repo',
      reinstallable: true,
      sourceType: 'github',
      instances: [{ scope: 'project', path: '/home/user/proj/.agents/skills/tdd-workflow', agents: [] }],
    })

    const app = createApp()
    const res = await request(app).post('/api/skills/tdd-workflow/install-global')
    expect(res.status).toBe(200)
    expect(mockInventoryInstance.installGlobalSkill).toHaveBeenCalledWith('tdd-workflow-1', [], ['codex'])
  })

  it('returns 409 when the asset has no reinstall source', async () => {
    mockInventoryInstance.resolveSkillRef.mockResolvedValue({
      id: 'tdd-workflow-1',
      name: 'tdd-workflow',
      description: '',
      source: '',
      reinstallSource: '',
      reinstallable: false,
      sourceType: 'unknown',
      instances: [],
    })

    const app = createApp()
    const res = await request(app).post('/api/skills/tdd-workflow/install-global')
    expect(res.status).toBe(409)
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
