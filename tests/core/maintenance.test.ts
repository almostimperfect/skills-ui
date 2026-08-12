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
  vi.useRealTimers()
  vi.unstubAllEnvs()
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

  it('ignores ambient GitHub tokens and always performs anonymous update checks', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'environment-secret')
    vi.stubEnv('GH_TOKEN', 'alternate-environment-secret')
    mockReadGlobalSkillLock.mockResolvedValue({
      version: 3,
      skills: {
        review: {
          source: 'owner/repo',
          sourceType: 'github',
          sourceUrl: 'https://github.com/owner/repo',
          skillPath: 'skills/review',
          skillFolderHash: 'same-hash',
        },
      },
    })
    mockReadLocalSkillLock.mockResolvedValue({ version: 1, skills: {} })
    let requestCount = 0
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      requestCount += 1
      if (requestCount === 1) return { ok: false } as Response
      return {
        ok: true,
        json: async () => ({
          tree: [{ type: 'tree', path: 'skills/review', sha: 'same-hash' }],
        }),
      } as Response
    })
    global.fetch = fetchMock as unknown as typeof global.fetch

    const maintenance = await getSkillMaintenance(globalSkill(), [])

    expect(maintenance.update.status).toBe('up-to-date')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const requestInits = fetchMock.mock.calls.map(call => call[1] as RequestInit)
    for (const requestInit of requestInits) {
      expect(requestInit.credentials).toBe('omit')
      expect(requestInit.headers).toEqual({
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'skills-ui',
      })
      expect(Object.keys(requestInit.headers as Record<string, string>)).not.toContain('Authorization')
    }
    expect(requestInits[0]?.signal).toBeInstanceOf(AbortSignal)
    expect(requestInits[1]?.signal).toBe(requestInits[0]?.signal)
  })

  it('bounds the complete GitHub fallback check with an abort signal and returns a stable error', async () => {
    vi.useFakeTimers()
    mockReadGlobalSkillLock.mockResolvedValue({
      version: 3,
      skills: {
        review: {
          source: 'owner/repo',
          sourceType: 'github',
          sourceUrl: 'https://github.com/owner/repo',
          skillPath: 'skills/review',
          skillFolderHash: 'old-hash',
        },
      },
    })
    mockReadLocalSkillLock.mockResolvedValue({ version: 1, skills: {} })

    let resolveFetchStarted: (() => void) | undefined
    const fetchStarted = new Promise<void>(resolve => {
      resolveFetchStarted = resolve
    })
    let requestSignal: AbortSignal | undefined
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined
      resolveFetchStarted?.()
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(new Error('request aborted')), { once: true })
      })
    })
    global.fetch = fetchMock as unknown as typeof global.fetch

    const maintenancePromise = getSkillMaintenance(globalSkill(), [])
    await fetchStarted
    expect(requestSignal).toBeInstanceOf(AbortSignal)
    expect(requestSignal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(10_000)
    const maintenance = await maintenancePromise

    expect(requestSignal?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(maintenance.update).toMatchObject({
      supported: true,
      status: 'error',
      reason: 'Could not fetch the latest version hash from GitHub.',
    })
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

function globalSkill(): InventorySkill {
  return {
    id: 'review-1',
    name: 'review',
    description: '',
    source: 'owner/repo',
    reinstallSource: 'owner/repo',
    reinstallable: true,
    sourceType: 'github',
    instances: [{ scope: 'global', path: '/workspace/.agents/skills/review', agents: [] }],
  }
}
