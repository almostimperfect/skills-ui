import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createInventoryManager } from '../../src/core/inventory.js'
import type { DiscoveredSkill, Project } from '../../src/core/types.js'

const mockListInstalledSkills = vi.fn()
const mockAddSkill = vi.fn()
const mockRemoveSkill = vi.fn()
const { MockSkillsCliError } = vi.hoisted(() => ({
  MockSkillsCliError: class MockSkillsCliError extends Error {},
}))

vi.mock('../../src/core/skills-cli.js', () => ({
  listInstalledSkills: (...args: unknown[]) => mockListInstalledSkills(...args),
  addSkill: (...args: unknown[]) => mockAddSkill(...args),
  removeSkill: (...args: unknown[]) => mockRemoveSkill(...args),
  SkillsCliError: MockSkillsCliError,
}))

let tmpPath: string
let inventoryPath: string
let archiveDir: string
let projectPath: string
let project: Project

async function writeSkill(dir: string, name: string, description = 'A test skill') {
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n`,
    'utf-8'
  )
}

beforeEach(async () => {
  process.env.SKILLS_UI_DISABLE_FS_DISCOVERY = '1'
  tmpPath = await mkdtemp(join(tmpdir(), 'skills-inventory-test-'))
  inventoryPath = join(tmpPath, 'inventory.json')
  archiveDir = join(tmpPath, 'archive')
  projectPath = join(tmpPath, 'project')
  project = { path: projectPath, name: 'project', agents: ['claude-code'] }

  mockListInstalledSkills.mockReset()
  mockAddSkill.mockReset()
  mockRemoveSkill.mockReset()
  mockListInstalledSkills.mockResolvedValue([])
})

afterEach(async () => {
  delete process.env.SKILLS_UI_DISABLE_FS_DISCOVERY
  await rm(tmpPath, { recursive: true, force: true })
})

describe('inventory reconcile', () => {
  it('discovers project skills from managed filesystem paths without the skills CLI', async () => {
    delete process.env.SKILLS_UI_DISABLE_FS_DISCOVERY
    project = { path: projectPath, name: 'project', agents: ['codex', 'gemini-cli'] }
    const skillDir = join(projectPath, '.agents', 'skills', 'filesystem-skill')
    await writeSkill(skillDir, 'filesystem-skill')
    mockListInstalledSkills.mockResolvedValue([])

    const manager = createInventoryManager(inventoryPath, archiveDir)
    const inventory = await manager.reconcile([project])
    const skill = Object.values(inventory.skills).find(item => item.name === 'filesystem-skill')

    expect(skill).toBeDefined()
    expect(skill?.instances[0]?.path).toBe(skillDir)
    expect(skill?.instances[0]?.agents.sort()).toEqual(['Codex', 'Gemini CLI'])
  })

  it('archives a discovered skill without reinstall source immediately', async () => {
    const skillDir = join(projectPath, '.agents', 'skills', 'local-skill')
    await writeSkill(skillDir, 'local-skill')

    mockListInstalledSkills.mockImplementation(async (options?: { global?: boolean; cwd?: string }) => {
      if (options?.global) return []
      if (options?.cwd === projectPath) {
        const discovered: DiscoveredSkill[] = [
          {
            name: 'local-skill',
            description: '',
            path: skillDir,
            scope: 'project',
            agents: [],
          },
        ]
        return discovered
      }
      return []
    })

    const manager = createInventoryManager(inventoryPath, archiveDir)
    const inventory = await manager.reconcile([project])
    const skill = Object.values(inventory.skills).find(item => item.name === 'local-skill')

    expect(skill).toBeDefined()
    expect(skill.reinstallable).toBe(true)
    expect(skill.archivedPath).toBeTruthy()
    expect(skill.reinstallSource).toBe(skill.archivedPath)
    expect(await readFile(join(skill.archivedPath!, 'SKILL.md'), 'utf-8')).toContain('local-skill')
  })

  it('preserves catalog entries after all live instances disappear', async () => {
    const skillDir = join(projectPath, '.agents', 'skills', 'local-skill')
    await writeSkill(skillDir, 'local-skill')

    mockListInstalledSkills.mockImplementation(async (options?: { global?: boolean; cwd?: string }) => {
      if (options?.global) return []
      if (options?.cwd === projectPath) {
        return [
          {
            name: 'local-skill',
            description: '',
            path: skillDir,
            scope: 'project' as const,
            agents: [],
          },
        ]
      }
      return []
    })

    const manager = createInventoryManager(inventoryPath, archiveDir)
    await manager.reconcile([project])

    mockListInstalledSkills.mockResolvedValue([])
    const inventory = await manager.reconcile([project])
    const skill = Object.values(inventory.skills).find(item => item.name === 'local-skill')

    expect(skill).toBeDefined()
    expect(skill?.instances).toEqual([])
    expect(skill?.reinstallable).toBe(true)
  })

  it('skips a broken registered project during reconcile', async () => {
    const skillDir = join(tmpPath, 'global-skill')
    await writeSkill(skillDir, 'global-skill')
    const brokenProject = { path: join(tmpPath, 'missing-project'), name: 'missing-project', agents: ['codex'] }

    mockListInstalledSkills.mockImplementation(async (options?: { global?: boolean; cwd?: string }) => {
      if (options?.global) {
        return [
          {
            name: 'global-skill',
            description: '',
            path: skillDir,
            scope: 'global' as const,
            agents: [],
          },
        ]
      }
      if (options?.cwd === brokenProject.path) {
        throw new MockSkillsCliError('skills CLI not found. Try running: npm install')
      }
      return []
    })

    const manager = createInventoryManager(inventoryPath, archiveDir)
    const inventory = await manager.reconcile([brokenProject])
    const skill = Object.values(inventory.skills).find(item => item.name === 'global-skill')

    expect(skill).toBeDefined()
    expect(skill?.instances[0]?.scope).toBe('global')
  })

  it('merges project installs with the same name and lock content hash into one asset', async () => {
    const projectA = { path: join(tmpPath, 'project-a'), name: 'project-a', agents: ['codex'] }
    const projectB = { path: join(tmpPath, 'project-b'), name: 'project-b', agents: ['codex'] }
    const skillA = join(projectA.path, '.agents', 'skills', 'same-skill')
    const skillB = join(projectB.path, '.agents', 'skills', 'same-skill')
    await writeSkill(skillA, 'same-skill', 'Same content')
    await writeSkill(skillB, 'same-skill', 'Same content')
    await writeFile(join(projectA.path, 'skills-lock.json'), JSON.stringify({
      version: 1,
      skills: {
        'same-skill': {
          source: join(tmpPath, 'fixtures'),
          sourceType: 'local',
          computedHash: 'same-content-hash',
        },
      },
    }))
    await writeFile(join(projectB.path, 'skills-lock.json'), JSON.stringify({
      version: 1,
      skills: {
        'same-skill': {
          source: join(tmpPath, 'archive', 'same-skill-old'),
          sourceType: 'local',
          computedHash: 'same-content-hash',
        },
      },
    }))

    mockListInstalledSkills.mockImplementation(async (options?: { global?: boolean; cwd?: string }) => {
      if (options?.global) return []
      if (options?.cwd === projectA.path) {
        return [{ name: 'same-skill', description: '', path: skillA, scope: 'project' as const, agents: [] }]
      }
      if (options?.cwd === projectB.path) {
        return [{ name: 'same-skill', description: '', path: skillB, scope: 'project' as const, agents: [] }]
      }
      return []
    })

    const manager = createInventoryManager(inventoryPath, archiveDir)
    const inventory = await manager.reconcile([projectA, projectB])
    const matches = Object.values(inventory.skills).filter(item => item.name === 'same-skill')

    expect(matches).toHaveLength(1)
    expect(matches[0].instances).toHaveLength(2)
  })

  it('migrates old archive-based project assets when lock content hash is available', async () => {
    const projectA = { path: join(tmpPath, 'project-a'), name: 'project-a', agents: ['codex'] }
    const projectB = { path: join(tmpPath, 'project-b'), name: 'project-b', agents: ['codex'] }
    const skillA = join(projectA.path, '.agents', 'skills', 'same-skill')
    const skillB = join(projectB.path, '.agents', 'skills', 'same-skill')
    const archiveA = join(archiveDir, 'same-skill-a')
    const archiveB = join(archiveDir, 'same-skill-b')
    await writeSkill(skillA, 'same-skill', 'Same content')
    await writeSkill(skillB, 'same-skill', 'Same content')
    await writeSkill(archiveA, 'same-skill', 'Same content')
    await writeSkill(archiveB, 'same-skill', 'Same content')
    await writeFile(join(projectA.path, 'skills-lock.json'), JSON.stringify({
      version: 1,
      skills: {
        'same-skill': {
          source: join(tmpPath, 'fixtures'),
          sourceType: 'local',
          computedHash: 'same-content-hash',
        },
      },
    }))
    await writeFile(join(projectB.path, 'skills-lock.json'), JSON.stringify({
      version: 1,
      skills: {
        'same-skill': {
          source: archiveA,
          sourceType: 'local',
          computedHash: 'same-content-hash',
        },
      },
    }))
    await writeFile(inventoryPath, JSON.stringify({
      version: 2,
      skills: {
        oldA: {
          id: 'oldA',
          name: 'same-skill',
          description: 'Same content',
          source: archiveA,
          reinstallSource: archiveA,
          reinstallable: true,
          sourceType: 'archive',
          archivedPath: archiveA,
          instances: [{ scope: 'project', path: skillA, agents: [], projectPath: projectA.path }],
        },
        oldB: {
          id: 'oldB',
          name: 'same-skill',
          description: 'Same content',
          source: archiveB,
          reinstallSource: archiveB,
          reinstallable: true,
          sourceType: 'archive',
          archivedPath: archiveB,
          instances: [{ scope: 'project', path: skillB, agents: [], projectPath: projectB.path }],
        },
      },
    }))

    mockListInstalledSkills.mockImplementation(async (options?: { global?: boolean; cwd?: string }) => {
      if (options?.global) return []
      if (options?.cwd === projectA.path) {
        return [{ name: 'same-skill', description: '', path: skillA, scope: 'project' as const, agents: [] }]
      }
      if (options?.cwd === projectB.path) {
        return [{ name: 'same-skill', description: '', path: skillB, scope: 'project' as const, agents: [] }]
      }
      return []
    })

    const manager = createInventoryManager(inventoryPath, archiveDir)
    const inventory = await manager.reconcile([projectA, projectB])
    const matches = Object.values(inventory.skills).filter(item => item.name === 'same-skill')

    expect(matches).toHaveLength(1)
    expect(matches[0].instances).toHaveLength(2)
  })

  it('merges global and project installs with identical skill content into one asset', async () => {
    const globalSkill = join(tmpPath, 'global', 'same-skill')
    const projectSkill = join(projectPath, '.agents', 'skills', 'same-skill')
    await writeSkill(globalSkill, 'same-skill', 'Same content')
    await writeSkill(projectSkill, 'same-skill', 'Same content')

    mockListInstalledSkills.mockImplementation(async (options?: { global?: boolean; cwd?: string }) => {
      if (options?.global) {
        return [{ name: 'same-skill', description: '', path: globalSkill, scope: 'global' as const, agents: ['Codex'] }]
      }
      if (options?.cwd === projectPath) {
        return [{ name: 'same-skill', description: '', path: projectSkill, scope: 'project' as const, agents: ['Codex'] }]
      }
      return []
    })

    const manager = createInventoryManager(inventoryPath, archiveDir)
    const inventory = await manager.reconcile([project])
    const matches = Object.values(inventory.skills).filter(item => item.name === 'same-skill')

    expect(matches).toHaveLength(1)
    expect(matches[0].instances.map(instance => instance.scope).sort()).toEqual(['global', 'project'])
  })

  it('drops old catalog-only archive duplicates when a live content-matched asset exists', async () => {
    const globalSkill = join(tmpPath, 'global', 'same-skill')
    const oldArchive = join(archiveDir, 'same-skill-old')
    await writeSkill(globalSkill, 'same-skill', 'Same content')
    await writeSkill(oldArchive, 'same-skill', 'Same content')
    await writeFile(inventoryPath, JSON.stringify({
      version: 2,
      skills: {
        oldCatalog: {
          id: 'oldCatalog',
          name: 'same-skill',
          description: 'Same content',
          source: oldArchive,
          reinstallSource: oldArchive,
          reinstallable: true,
          sourceType: 'archive',
          archivedPath: oldArchive,
          instances: [],
        },
      },
    }))

    mockListInstalledSkills.mockImplementation(async (options?: { global?: boolean }) => {
      if (options?.global) {
        return [{ name: 'same-skill', description: '', path: globalSkill, scope: 'global' as const, agents: ['Codex'] }]
      }
      return []
    })

    const manager = createInventoryManager(inventoryPath, archiveDir)
    const inventory = await manager.reconcile([project])
    const matches = Object.values(inventory.skills).filter(item => item.name === 'same-skill')

    expect(matches).toHaveLength(1)
    expect(matches[0].instances).toHaveLength(1)
  })

  it('removes project skill directories for managed agents directly', async () => {
    const skillDir = join(projectPath, '.agents', 'skills', 'shared-skill')
    await writeSkill(skillDir, 'shared-skill')
    await writeFile(inventoryPath, JSON.stringify({
      version: 2,
      skills: {
        'shared-skill-1': {
          id: 'shared-skill-1',
          name: 'shared-skill',
          description: '',
          source: skillDir,
          reinstallSource: skillDir,
          reinstallable: true,
          sourceType: 'archive',
          instances: [
            {
              scope: 'project',
              path: skillDir,
              agents: ['Codex', 'Cursor', 'Gemini CLI'],
              projectPath,
            },
          ],
        },
      },
    }))

    const manager = createInventoryManager(inventoryPath, archiveDir)
    await manager.disableProjectSkill('shared-skill-1', projectPath, ['codex', 'gemini-cli'])

    await expect(readFile(join(skillDir, 'SKILL.md'), 'utf-8')).rejects.toThrow()
    expect(mockRemoveSkill).not.toHaveBeenCalled()
  })

  it('installs project skills by copying local sources without writing a skills CLI lock', async () => {
    const sourceDir = join(tmpPath, 'source', 'copy-skill')
    const targetDir = join(projectPath, '.agents', 'skills', 'copy-skill')
    await writeSkill(sourceDir, 'copy-skill')
    await writeFile(inventoryPath, JSON.stringify({
      version: 2,
      skills: {
        'copy-skill-1': {
          id: 'copy-skill-1',
          name: 'copy-skill',
          description: '',
          source: sourceDir,
          reinstallSource: sourceDir,
          reinstallable: true,
          sourceType: 'archive',
          instances: [],
        },
      },
    }))

    const manager = createInventoryManager(inventoryPath, archiveDir)
    const resolved = await manager.resolveSkillRef('copy-skill', [project])
    await manager.enableProjectSkill(resolved!.id, projectPath, ['codex'], [project])

    expect(await readFile(join(targetDir, 'SKILL.md'), 'utf-8')).toContain('copy-skill')
    await expect(readFile(join(projectPath, 'skills-lock.json'), 'utf-8')).rejects.toThrow()
    expect(mockAddSkill).not.toHaveBeenCalled()
  })

  it('preserves local source metadata after direct copy install and reconcile', async () => {
    const sourceDir = join(tmpPath, 'source', 'copy-skill')
    await writeSkill(sourceDir, 'copy-skill', 'Local source metadata')
    await writeFile(inventoryPath, JSON.stringify({
      version: 2,
      skills: {
        'copy-skill-1': {
          id: 'copy-skill-1',
          name: 'copy-skill',
          description: 'Local source metadata',
          source: sourceDir,
          reinstallSource: sourceDir,
          reinstallable: true,
          sourceType: 'local',
          instances: [],
        },
      },
    }))

    const manager = createInventoryManager(inventoryPath, archiveDir)
    const resolved = await manager.resolveSkillRef('copy-skill', [project])
    await manager.enableProjectSkill(resolved!.id, projectPath, ['codex'], [project])
    mockListInstalledSkills.mockImplementation(async (options?: { global?: boolean; cwd?: string }) => {
      if (options?.global) return []
      if (options?.cwd === projectPath) {
        return [{
          name: 'copy-skill',
          description: '',
          path: join(projectPath, '.agents', 'skills', 'copy-skill'),
          scope: 'project' as const,
          agents: ['Codex'],
        }]
      }
      return []
    })
    const inventory = await manager.reconcile([project])
    const skill = Object.values(inventory.skills).find(item => item.name === 'copy-skill')

    expect(skill?.sourceType).toBe('local')
    expect(skill?.source).toBe(sourceDir)
    expect(skill?.reinstallSource).toBe(sourceDir)
    expect(skill?.instances).toHaveLength(1)
  })

  it('installs CLI-managed remote skills into another project through the skills CLI', async () => {
    const projectB = { path: join(tmpPath, 'project-b'), name: 'project-b', agents: ['codex'] }
    await writeFile(inventoryPath, JSON.stringify({
      version: 2,
      skills: {
        'remote-skill-1': {
          id: 'remote-skill-1',
          name: 'remote-skill',
          description: '',
          source: 'owner/repo',
          reinstallSource: 'owner/repo',
          reinstallable: true,
          sourceType: 'github',
          instances: [],
        },
      },
    }))

    const manager = createInventoryManager(inventoryPath, archiveDir)
    const resolved = await manager.resolveSkillRef('remote-skill', [project, projectB])
    await manager.enableProjectSkill(resolved!.id, projectB.path, ['codex'], [project, projectB])

    expect(mockAddSkill).toHaveBeenCalledWith('owner/repo', {
      cwd: projectB.path,
      skillNames: ['remote-skill'],
      agents: ['codex'],
    })
  })

  it('disables CLI-managed remote project skills through the skills CLI', async () => {
    const skillDir = join(projectPath, '.agents', 'skills', 'remote-skill')
    await writeSkill(skillDir, 'remote-skill')
    await writeFile(join(projectPath, 'skills-lock.json'), JSON.stringify({
      version: 1,
      skills: {
        'remote-skill': {
          source: 'owner/repo',
          sourceType: 'github',
        },
      },
    }))
    await writeFile(inventoryPath, JSON.stringify({
      version: 2,
      skills: {
        'remote-skill-1': {
          id: 'remote-skill-1',
          name: 'remote-skill',
          description: '',
          source: 'owner/repo',
          reinstallSource: 'owner/repo',
          reinstallable: true,
          sourceType: 'github',
          instances: [
            {
              scope: 'project',
              path: skillDir,
              agents: ['Codex'],
              projectPath,
            },
          ],
        },
      },
    }))

    const manager = createInventoryManager(inventoryPath, archiveDir)
    await manager.disableProjectSkill('remote-skill-1', projectPath, ['codex'])

    expect(mockRemoveSkill).toHaveBeenCalledWith('remote-skill', {
      cwd: projectPath,
      agents: ['codex'],
    })
    expect(await readFile(join(skillDir, 'SKILL.md'), 'utf-8')).toContain('remote-skill')
  })
})
