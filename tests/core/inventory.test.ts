import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createInventoryManager } from '../../src/core/inventory.js'
import type { DiscoveredSkill, Project } from '../../src/core/types.js'

const mockListInstalledSkills = vi.fn()
const mockAddSkill = vi.fn()
const mockRemoveSkill = vi.fn()

vi.mock('../../src/core/skills-cli.js', () => ({
  listInstalledSkills: (...args: unknown[]) => mockListInstalledSkills(...args),
  addSkill: (...args: unknown[]) => mockAddSkill(...args),
  removeSkill: (...args: unknown[]) => mockRemoveSkill(...args),
}))

let tmpPath: string
let inventoryPath: string
let archiveDir: string
let projectPath: string
let project: Project

async function writeSkill(dir: string, name: string, description = 'A test skill') {
  await mkdir(dir, { recursive: true })
  const { writeFile } = await import('fs/promises')
  await writeFile(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n`,
    'utf-8'
  )
}

beforeEach(async () => {
  tmpPath = await mkdtemp(join(tmpdir(), 'skills-inventory-test-'))
  inventoryPath = join(tmpPath, 'inventory.json')
  archiveDir = join(tmpPath, 'archive')
  projectPath = join(tmpPath, 'project')
  project = { path: projectPath, name: 'project', agents: ['claude-code'] }

  mockListInstalledSkills.mockReset()
  mockAddSkill.mockReset()
  mockRemoveSkill.mockReset()
})

afterEach(async () => {
  await rm(tmpPath, { recursive: true, force: true })
})

describe('inventory reconcile', () => {
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
})
