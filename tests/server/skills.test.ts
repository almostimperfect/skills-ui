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

import { listSkills, addSkill, removeSkill } from '../../src/core/skills-cli.js'
import { createApp } from '../../src/server/index.js'

const mockList = listSkills as ReturnType<typeof vi.fn>
const mockAdd = addSkill as ReturnType<typeof vi.fn>
const mockRemove = removeSkill as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockList.mockReset()
  mockAdd.mockReset()
  mockRemove.mockReset()
  mockRegistryInstance.listProjects.mockResolvedValue([])
  mockStateInstance.isDisabled.mockResolvedValue(false)
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
    const { parseSkillMetadata } = await import('../../src/core/metadata.js')
    const mockMeta = parseSkillMetadata as ReturnType<typeof vi.fn>
    mockMeta.mockResolvedValue({ name: 'tdd-workflow', description: 'TDD skill', source: '' })

    mockRegistryInstance.listProjects.mockResolvedValue([
      { path: '/home/user/proj', name: 'proj', agents: ['claude-code'] },
    ])

    mockStateInstance.isDisabled.mockResolvedValue(false)

    const app = createApp()
    const res = await request(app).get('/api/skills/tdd-workflow')
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('tdd-workflow')
    expect(res.body.status['/home/user/proj']['claude-code']).toBe('enabled')
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
})
