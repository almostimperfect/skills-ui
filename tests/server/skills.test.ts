// tests/server/skills.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

const mockStateInstance = {
  getDisabled: vi.fn().mockResolvedValue({}),
  isDisabled: vi.fn().mockResolvedValue(false),
  disable: vi.fn().mockResolvedValue(undefined),
  enable: vi.fn().mockResolvedValue(undefined),
  cleanupSkill: vi.fn().mockResolvedValue(undefined),
  cleanupProject: vi.fn().mockResolvedValue(undefined),
}

const mockRegistryInstance = {
  listProjects: vi.fn().mockResolvedValue([]),
  getProject: vi.fn().mockResolvedValue(undefined),
  registerProject: vi.fn(),
  updateProject: vi.fn(),
  unregisterProject: vi.fn(),
}

vi.mock('../../src/core/skills-cli.js', () => ({
  listSkills: vi.fn(),
  addSkill: vi.fn(),
  removeSkill: vi.fn(),
}))
vi.mock('../../src/core/metadata.js', () => ({
  parseSkillMetadata: vi.fn(),
}))
vi.mock('../../src/core/state.js', () => ({
  createStateManager: vi.fn(() => mockStateInstance),
}))
vi.mock('../../src/core/projects.js', () => ({
  createProjectRegistry: vi.fn(() => mockRegistryInstance),
}))
vi.mock('fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return { ...actual, access: vi.fn().mockResolvedValue(undefined) }
})

import { listSkills, addSkill, removeSkill } from '../../src/core/skills-cli.js'
import { createApp } from '../../src/server/index.js'
import { parseSkillMetadata } from '../../src/core/metadata.js'
import { access } from 'fs/promises'

const mockList = listSkills as ReturnType<typeof vi.fn>
const mockAdd = addSkill as ReturnType<typeof vi.fn>
const mockRemove = removeSkill as ReturnType<typeof vi.fn>
const mockMeta = parseSkillMetadata as ReturnType<typeof vi.fn>
const mockAccess = access as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockList.mockReset()
  mockAdd.mockReset()
  mockRemove.mockReset()
  mockRegistryInstance.listProjects.mockResolvedValue([])
  mockRegistryInstance.getProject.mockResolvedValue({
    path: '/home/user/proj',
    name: 'proj',
    agents: ['claude-code'],
  })
  mockMeta.mockReset()
  mockMeta.mockResolvedValue({ name: 'tdd-workflow', description: 'TDD skill', source: '' })
  mockAccess.mockReset()
  mockAccess.mockResolvedValue(undefined)
  mockStateInstance.getDisabled.mockReset()
  mockStateInstance.getDisabled.mockResolvedValue({})
  mockStateInstance.isDisabled.mockResolvedValue(false)
  mockStateInstance.enable.mockClear()
  mockStateInstance.enable.mockResolvedValue(undefined)
  mockStateInstance.disable.mockClear()
  mockStateInstance.disable.mockResolvedValue(undefined)
})

describe('GET /api/skills', () => {
  it('returns list of installed skills', async () => {
    mockList.mockResolvedValue([{ name: 'tdd-workflow', description: 'TDD', source: '' }])
    const app = createApp()
    const res = await request(app).get('/api/skills')
    expect(res.status).toBe(200)
    expect(res.body[0].name).toBe('tdd-workflow')
  })
})

describe('POST /api/skills', () => {
  it('calls addSkill and returns 201', async () => {
    mockAdd.mockResolvedValue(undefined)
    const app = createApp()
    const res = await request(app).post('/api/skills').send({ source: 'owner/repo' })
    expect(res.status).toBe(201)
    expect(mockAdd).toHaveBeenCalledWith('owner/repo')
  })

  it('returns 400 when source is missing', async () => {
    const app = createApp()
    const res = await request(app).post('/api/skills').send({})
    expect(res.status).toBe(400)
  })
})

describe('GET /api/skills/:name', () => {
  it('returns skill detail with status map across projects', async () => {
    mockMeta.mockResolvedValue({ name: 'tdd-workflow', description: 'TDD skill', source: '' })

    mockRegistryInstance.listProjects.mockResolvedValue([
      { path: '/home/user/proj', name: 'proj', agents: ['claude-code'] },
    ])

    mockStateInstance.getDisabled.mockResolvedValue({ 'claude-code': [] })

    const app = createApp()
    const res = await request(app).get('/api/skills/tdd-workflow')
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('tdd-workflow')
    expect(res.body.status['/home/user/proj']['claude-code']).toBe('enabled')
    expect(mockStateInstance.getDisabled).toHaveBeenCalledTimes(1)
    expect(mockStateInstance.isDisabled).not.toHaveBeenCalled()
  })

  it('UX-001: returns 404 when the canonical skill directory does not exist', async () => {
    mockAccess.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
    const app = createApp()
    const res = await request(app).get('/api/skills/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Skill not found' })
    expect(mockMeta).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/skills/:name', () => {
  it('calls removeSkill and returns 204', async () => {
    mockRemove.mockResolvedValue(undefined)
    const app = createApp()
    const res = await request(app).delete('/api/skills/tdd-workflow')
    expect(res.status).toBe(204)
    expect(mockRemove).toHaveBeenCalledWith('tdd-workflow')
  })

  it('UX-011: returns 404 without calling removeSkill when the skill is absent', async () => {
    mockAccess.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
    const app = createApp()
    const res = await request(app).delete('/api/skills/ghost')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Skill not found' })
    expect(mockRemove).not.toHaveBeenCalled()
  })
})

describe.each(['enable', 'disable'] as const)('POST /api/skills/:name/%s', op => {
  it(`calls state.${op} with project, agent, and skill name`, async () => {
    const app = createApp()
    const res = await request(app)
      .post(`/api/skills/tdd-workflow/${op}`)
      .send({ projectPath: '/home/user/proj', agent: 'claude-code' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(mockStateInstance[op]).toHaveBeenCalledWith(
      '/home/user/proj',
      'claude-code',
      'tdd-workflow',
      expect.any(Object)
    )
  })

  it('returns 400 when projectPath or agent is missing', async () => {
    const app = createApp()
    const noAgent = await request(app)
      .post(`/api/skills/tdd-workflow/${op}`)
      .send({ projectPath: '/home/user/proj' })
    expect(noAgent.status).toBe(400)

    const noProject = await request(app)
      .post(`/api/skills/tdd-workflow/${op}`)
      .send({ agent: 'claude-code' })
    expect(noProject.status).toBe(400)
    expect(mockStateInstance[op]).not.toHaveBeenCalled()
  })

  it('returns 400 listing valid agents when agent is not whitelisted', async () => {
    const app = createApp()
    const res = await request(app)
      .post(`/api/skills/tdd-workflow/${op}`)
      .send({ projectPath: '/home/user/proj', agent: 'not-an-agent' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('claude-code')
    expect(mockStateInstance[op]).not.toHaveBeenCalled()
  })

  it('DEBT-001: returns 404 when the project is not registered', async () => {
    mockRegistryInstance.getProject.mockResolvedValueOnce(undefined)
    const app = createApp()
    const res = await request(app)
      .post(`/api/skills/tdd-workflow/${op}`)
      .send({ projectPath: '/not/registered', agent: 'claude-code' })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Project not found' })
    expect(mockStateInstance[op]).not.toHaveBeenCalled()
  })

  it('DEBT-001: returns 400 when the agent is not managed by the project', async () => {
    mockRegistryInstance.getProject.mockResolvedValueOnce({
      path: '/home/user/proj',
      name: 'proj',
      agents: ['codex'],
    })
    const app = createApp()
    const res = await request(app)
      .post(`/api/skills/tdd-workflow/${op}`)
      .send({ projectPath: '/home/user/proj', agent: 'claude-code' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('not managed')
    expect(mockStateInstance[op]).not.toHaveBeenCalled()
  })

  it(`returns 500 when state.${op} throws`, async () => {
    mockStateInstance[op].mockRejectedValueOnce(new Error('disk full'))
    const app = createApp()
    const res = await request(app)
      .post(`/api/skills/tdd-workflow/${op}`)
      .send({ projectPath: '/home/user/proj', agent: 'claude-code' })
    expect(res.status).toBe(500)
  })
})
