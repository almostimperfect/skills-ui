import { cp, mkdir, stat } from 'fs/promises'
import { dirname, join } from 'path'
import { createHash } from 'crypto'
import { readJson, writeJson } from './file-store.js'
import { addSkill, listInstalledSkills, removeSkill } from './skills-cli.js'
import { parseSkillMetadata } from './metadata.js'
import { readGlobalSkillLock, readLocalSkillLock } from './skills-lock.js'
import { buildProjectSkillStatus } from './status.js'
import { getProjectGroupAgents, isUniversalProjectAgent, normalizeAgentId } from './agents.js'
import type {
  InventorySkill,
  InventoryState,
  Project,
  SkillInstance,
  DiscoveredSkill,
} from './types.js'

const INVENTORY_VERSION = 2

function defaultInventory(): InventoryState {
  return { version: INVENTORY_VERSION, skills: {} }
}

function slugifySkillName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255) || 'unnamed-skill'
}

function shouldArchiveSourceType(sourceType?: string): boolean {
  return !sourceType || sourceType === 'local' || sourceType === 'node_modules'
}

function buildCatalogId(name: string, sourceType: string, sourceRef: string): string {
  const hash = createHash('sha256')
    .update(`${name}\0${sourceType}\0${sourceRef}`)
    .digest('hex')
    .slice(0, 12)
  return `${slugifySkillName(name)}-${hash}`
}

function sameInstance(left: SkillInstance, right: SkillInstance): boolean {
  return left.scope === right.scope && left.path === right.path && left.projectPath === right.projectPath
}

function toInstance(skill: DiscoveredSkill, projectPath?: string): SkillInstance {
  return {
    scope: skill.scope,
    path: skill.path,
    agents: skill.agents,
    projectPath,
  }
}

function normalizeInventoryState(raw: Partial<InventoryState> | undefined): InventoryState {
  const normalized: InventoryState = defaultInventory()
  const skills = raw?.skills ?? {}

  for (const [legacyKey, value] of Object.entries(skills)) {
    if (!value) continue
    const sourceType = value.sourceType || 'unknown'
    const sourceRef = value.reinstallSource || value.source || value.archivedPath || legacyKey
    const id = value.id || buildCatalogId(value.name, sourceType, sourceRef)
    const existing = normalized.skills[id]

    if (!existing) {
      normalized.skills[id] = {
        ...value,
        id,
        sourceType,
      }
      continue
    }

    const mergedInstances = [...existing.instances]
    for (const instance of value.instances) {
      if (!mergedInstances.some(existingInstance => sameInstance(existingInstance, instance))) {
        mergedInstances.push(instance)
      }
    }

    normalized.skills[id] = {
      ...existing,
      ...value,
      id,
      sourceType,
      instances: mergedInstances,
    }
  }

  return normalized
}

async function ensureArchivedCopy(skillPath: string, skillName: string, archiveDir: string): Promise<string> {
  if (skillPath === archiveDir || skillPath.startsWith(archiveDir + '/')) {
    return skillPath
  }
  const suffix = createHash('sha256').update(skillPath).digest('hex').slice(0, 10)
  const archivePath = join(archiveDir, `${slugifySkillName(skillName)}-${suffix}`)
  try {
    await stat(archivePath)
    return archivePath
  } catch {
    await mkdir(dirname(archivePath), { recursive: true })
    await cp(skillPath, archivePath, { recursive: true, dereference: true })
    return archivePath
  }
}

export interface InventoryManager {
  reconcile(projects: Project[]): Promise<InventoryState>
  listSkills(projects: Project[]): Promise<InventorySkill[]>
  getSkill(id: string, projects: Project[]): Promise<InventorySkill | undefined>
  resolveSkillRef(ref: string, projects: Project[]): Promise<InventorySkill | undefined>
  enableProjectSkill(id: string, projectPath: string, actionAgents: string[], projects: Project[]): Promise<void>
  disableProjectSkill(id: string, projectPath: string, actionAgents: string[]): Promise<void>
  updateGlobalSkill(id: string, projects: Project[]): Promise<void>
  removeGlobalSkill(id: string, projects: Project[]): Promise<void>
  splitGlobalSkill(id: string, projects: Project[]): Promise<void>
}

export function createInventoryManager(inventoryPath: string, archiveDir: string): InventoryManager {
  async function read(): Promise<InventoryState> {
    const raw = await readJson<InventoryState>(inventoryPath, defaultInventory())
    return normalizeInventoryState(raw)
  }

  async function write(state: InventoryState): Promise<void> {
    await writeJson(inventoryPath, state)
  }

  async function collectDiscoveredSkills(projects: Project[]): Promise<Array<DiscoveredSkill & { projectPath?: string }>> {
    const discovered: Array<DiscoveredSkill & { projectPath?: string }> = []

    for (const skill of await listInstalledSkills({ global: true })) {
      discovered.push(skill)
    }

    for (const project of projects) {
      const skills = await listInstalledSkills({ cwd: project.path })
      for (const skill of skills) {
        discovered.push({ ...skill, projectPath: project.path })
      }
    }

    return discovered
  }

  async function findPreviousSkillForInstance(
    discovered: DiscoveredSkill & { projectPath?: string },
    previousSkills: InventorySkill[]
  ): Promise<InventorySkill | undefined> {
    const instance = toInstance(discovered, discovered.projectPath)
    return previousSkills.find(skill => skill.instances.some(existing => sameInstance(existing, instance)))
  }

  async function resolveDiscoveredSkill(
    discovered: DiscoveredSkill & { projectPath?: string },
    previousSkills: InventorySkill[],
    globalLockPromise: Promise<Awaited<ReturnType<typeof readGlobalSkillLock>>>,
    localLockCache: Map<string, Promise<Awaited<ReturnType<typeof readLocalSkillLock>>>>
  ): Promise<InventorySkill> {
    const previous = await findPreviousSkillForInstance(discovered, previousSkills)
    const meta = await parseSkillMetadata(discovered.path, discovered.name)
    const globalLock = await globalLockPromise

    let source = previous?.source ?? meta.source ?? ''
    let reinstallSource = previous?.reinstallSource ?? ''
    let sourceType = previous?.sourceType ?? 'unknown'
    let reinstallable = previous?.reinstallable ?? false
    let archivedPath = previous?.archivedPath

    const globalEntry = globalLock.skills[discovered.name]
    if (discovered.scope === 'global' && globalEntry?.source) {
      source = globalEntry.sourceUrl || globalEntry.source
      reinstallSource = globalEntry.sourceUrl || globalEntry.source
      sourceType = globalEntry.sourceType || 'github'
      reinstallable = true
    }

    if ((!reinstallable || shouldArchiveSourceType(sourceType)) && discovered.projectPath) {
      let localLock = localLockCache.get(discovered.projectPath)
      if (!localLock) {
        localLock = readLocalSkillLock(discovered.projectPath)
        localLockCache.set(discovered.projectPath, localLock)
      }
      const localEntry = (await localLock).skills[discovered.name]
      if (localEntry?.source) {
        source = localEntry.source
        sourceType = localEntry.sourceType || 'unknown'
        reinstallSource = localEntry.source
        reinstallable = true
      }
    }

    if (!reinstallable || shouldArchiveSourceType(sourceType)) {
      const archiveSourcePath = archivedPath ?? discovered.path
      archivedPath = await ensureArchivedCopy(archiveSourcePath, discovered.name, archiveDir)
      reinstallSource = archivedPath
      reinstallable = true
      sourceType = 'archive'
      if (!source) source = archivedPath
    }

    const sourceRef = reinstallSource || source || archivedPath || discovered.path
    const id = buildCatalogId(discovered.name, sourceType, sourceRef)

    return {
      id,
      name: discovered.name,
      description: meta.description || previous?.description || '',
      source,
      reinstallSource,
      reinstallable,
      sourceType,
      archivedPath,
      instances: [toInstance(discovered, discovered.projectPath)],
    }
  }

  return {
    async reconcile(projects) {
      const previous = await read()
      const previousSkills = Object.values(previous.skills)
      const discovered = await collectDiscoveredSkills(projects)
      const next: InventoryState = defaultInventory()
      const globalLockPromise = readGlobalSkillLock()
      const localLockCache = new Map<string, Promise<Awaited<ReturnType<typeof readLocalSkillLock>>>>()

      for (const discoveredSkill of discovered) {
        const resolved = await resolveDiscoveredSkill(discoveredSkill, previousSkills, globalLockPromise, localLockCache)
        const existing = next.skills[resolved.id]

        if (!existing) {
          next.skills[resolved.id] = resolved
          continue
        }

        for (const instance of resolved.instances) {
          if (!existing.instances.some(existingInstance => sameInstance(existingInstance, instance))) {
            existing.instances.push(instance)
          }
        }
      }

      // Preserve catalog entries even when there are no currently installed instances.
      for (const [id, skill] of Object.entries(previous.skills)) {
        if (next.skills[id]) continue
        next.skills[id] = { ...skill, id, instances: [] }
      }

      await write(next)
      return next
    },

    async listSkills(projects) {
      const inventory = await this.reconcile(projects)
      return Object.values(inventory.skills).sort((a, b) =>
        a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
      )
    },

    async getSkill(id, projects) {
      const inventory = await this.reconcile(projects)
      return inventory.skills[id]
    },

    async resolveSkillRef(ref, projects) {
      const inventory = await this.reconcile(projects)
      if (inventory.skills[ref]) {
        return inventory.skills[ref]
      }

      const matches = Object.values(inventory.skills).filter(skill => skill.name === ref)
      if (matches.length === 1) {
        return matches[0]
      }
      if (matches.length > 1) {
        throw new Error(`Skill name "${ref}" is ambiguous. Use the catalog ID instead.`)
      }
      return undefined
    },

    async enableProjectSkill(id, projectPath, actionAgents, projects) {
      const inventory = await this.reconcile(projects)
      const skill = inventory.skills[id]
      if (!skill || !skill.reinstallable || !skill.reinstallSource) {
        throw new Error(`Skill "${id}" does not have a reinstall source`)
      }
      await addSkill(skill.reinstallSource, {
        cwd: projectPath,
        skillNames: [skill.name],
        agents: actionAgents,
      })
      await this.reconcile(projects)
    },

    async disableProjectSkill(id, projectPath, actionAgents) {
      const inventory = await read()
      const skill = inventory.skills[id]
      if (!skill) {
        throw new Error(`Skill "${id}" not found`)
      }
      await removeSkill(skill.name, { cwd: projectPath, agents: actionAgents })
    },

    async removeGlobalSkill(id, projects) {
      const inventory = await this.reconcile(projects)
      const skill = inventory.skills[id]
      if (!skill) {
        throw new Error(`Skill "${id}" not found`)
      }
      if (!skill.instances.some(instance => instance.scope === 'global')) {
        throw new Error(`Skill "${skill.name}" is not installed globally`)
      }
      await removeSkill(skill.name, { global: true })
    },

    async updateGlobalSkill(id, projects) {
      const inventory = await this.reconcile(projects)
      const skill = inventory.skills[id]
      if (!skill) {
        throw new Error(`Skill "${id}" not found`)
      }
      if (!skill.instances.some(instance => instance.scope === 'global')) {
        throw new Error(`Skill "${skill.name}" is not installed globally`)
      }
      if (!skill.reinstallable || !skill.reinstallSource) {
        throw new Error(`Skill "${skill.name}" does not have a reinstall source`)
      }
      await addSkill(skill.reinstallSource, {
        global: true,
        skillNames: [skill.name],
      })
      await this.reconcile(projects)
    },

    async splitGlobalSkill(id, projects) {
      const inventory = await this.reconcile(projects)
      const skill = inventory.skills[id]
      if (!skill) {
        throw new Error(`Skill "${id}" not found`)
      }
      if (!skill.instances.some(instance => instance.scope === 'global')) {
        throw new Error(`Skill "${skill.name}" is not installed globally`)
      }
      if (!skill.reinstallable || !skill.reinstallSource) {
        throw new Error(`Skill "${skill.name}" does not have a reinstall source`)
      }

      for (const project of projects) {
        const status = buildProjectSkillStatus(skill, project)
        const exclusiveAgents = project.agents
          .map(normalizeAgentId)
          .filter(agent => status[agent]?.state === 'global' && !isUniversalProjectAgent(agent))

        for (const agent of exclusiveAgents) {
          await this.enableProjectSkill(skill.id, project.path, [agent], projects)
        }

        if (exclusiveAgents.length === 0) {
          const universalAgents = project.agents
            .map(normalizeAgentId)
            .filter(agent => status[agent]?.state === 'global' && isUniversalProjectAgent(agent))
          if (universalAgents.length > 0) {
            await this.enableProjectSkill(
              skill.id,
              project.path,
              getProjectGroupAgents(project.agents, universalAgents[0]),
              projects
            )
          }
        }
      }

      await this.removeGlobalSkill(skill.id, projects)
      await this.reconcile(projects)
    },
  }
}
