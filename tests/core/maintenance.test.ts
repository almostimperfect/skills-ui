import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getSkillMaintenance } from '../../src/core/maintenance.js'
import type { InventorySkill, Project } from '../../src/core/types.js'

const mockReadGlobalSkillLock = vi.fn()
const mockReadLocalSkillLock = vi.fn()

vi.mock('../../src/core/skills-lock.js', () => ({
  readGlobalSkillLock: (...args: unknown[]) => mockReadGlobalSkillLock(...args),
  readLocalSkillLock: (...args: unknown[]) => mockReadLocalSkillLock(...args),
}))

let originalFetch: typeof global.fetch | undefined
let tmpPath: string

beforeEach(async () => {
  originalFetch = global.fetch
  tmpPath = await mkdtemp(join(tmpdir(), 'skills-maintenance-test-'))
  mockReadGlobalSkillLock.mockReset()
  mockReadLocalSkillLock.mockReset()
})

afterEach(async () => {
  global.fetch = originalFetch as typeof global.fetch
  await rm(tmpPath, { recursive: true, force: true })
})

describe('getSkillMaintenance', () => {
  it('marks global github skills as update-available when the remote hash changes', async () => {
    mockReadGlobalSkillLock.mockResolvedValue({
      version: 3,
      skills: {
        review: {
          source: 'owner/repo',
          sourceType: 'github',
          sourceUrl: 'https://github.com/owner/repo',
          skillPath: 'skills/review',
          skillFolderHash: 'old-hash',
          updatedAt: '2026-03-20T00:00:00.000Z',
        },
      },
    })
    mockReadLocalSkillLock.mockResolvedValue({ version: 1, skills: {} })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tree: [
          { type: 'tree', path: 'skills/review', sha: 'new-hash' },
        ],
      }),
    }) as unknown as typeof global.fetch

    const skill: InventorySkill = {
      id: 'review-1',
      name: 'review',
      description: '',
      source: 'owner/repo',
      reinstallSource: 'owner/repo',
      reinstallable: true,
      sourceType: 'github',
      instances: [{ scope: 'global', path: '/workspace/.agents/skills/review', agents: [] }],
    }

    const maintenance = await getSkillMaintenance(skill, [])
    expect(maintenance.update.status).toBe('update-available')
    expect(maintenance.modifiedProjects).toEqual([])
  })

  it('flags modified project copies when their computed hash no longer matches', async () => {
    const projectPath = join(tmpPath, 'project')
    const skillPath = join(projectPath, '.agents', 'skills', 'review')
    await mkdir(skillPath, { recursive: true })
    await writeFile(join(skillPath, 'SKILL.md'), '---\nname: review\n---\nchanged\n', 'utf-8')

    mockReadGlobalSkillLock.mockResolvedValue({ version: 3, skills: {} })
    mockReadLocalSkillLock.mockResolvedValue({
      version: 1,
      skills: {
        review: {
          source: 'owner/repo',
          sourceType: 'github',
          computedHash: 'stale-hash',
        },
      },
    })

    const project: Project = {
      path: projectPath,
      name: 'project',
      agents: ['codex'],
    }
    const skill: InventorySkill = {
      id: 'review-1',
      name: 'review',
      description: '',
      source: 'owner/repo',
      reinstallSource: 'owner/repo',
      reinstallable: true,
      sourceType: 'github',
      instances: [{ scope: 'project', projectPath, path: skillPath, agents: [] }],
    }

    const maintenance = await getSkillMaintenance(skill, [project])
    expect(maintenance.modifiedProjects).toEqual([
      {
        projectPath,
        paths: [skillPath],
      },
    ])
    expect(maintenance.update.status).toBe('unsupported')
  })
})
