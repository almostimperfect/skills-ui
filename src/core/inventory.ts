import { access, cp, mkdir, readFile, readdir, rm, stat } from 'fs/promises'
import { dirname, isAbsolute, join } from 'path'
import { createHash } from 'crypto'
import { readJson, writeJson } from './file-store.js'
import { addSkill, listInstalledSkills, removeSkill, SkillsCliError } from './skills-cli.js'
import { parseSkillMetadata } from './metadata.js'
import {
  readGlobalSkillLock,
  readLocalSkillLock,
} from './skills-lock.js'
import { buildProjectSkillStatus } from './status.js'
import {
  MANAGED_AGENTS,
  getAgentDisplayName,
  getManagedAgent,
  getProjectGroupAgents,
  isUniversalProjectAgent,
  normalizeAgentId,
  normalizeAgentList,
} from './agents.js'
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
  return !sourceType || sourceType === 'local' || sourceType === 'node_modules' || sourceType === 'archive'
}

function shouldArchiveDiscoveredSkill(
  sourceType: string | undefined,
  reinstallable: boolean,
  reinstallSource: string | undefined
): boolean {
  if (!reinstallable || !reinstallSource) return true
  return !sourceType || sourceType === 'unknown' || sourceType === 'node_modules'
}

function isRemoteSourceType(sourceType?: string): boolean {
  return sourceType === 'github' || sourceType === 'git' || sourceType === 'url' || sourceType === 'remote'
}

function shouldUseSkillsCli(skill: InventorySkill): boolean {
  const source = skill.reinstallSource || skill.source || ''
  if (isRemoteSourceType(skill.sourceType)) return true
  return Boolean(source && !isAbsolute(source) && !shouldArchiveSourceType(skill.sourceType))
}

function buildCatalogId(name: string, sourceType: string, sourceRef: string): string {
  const hash = createHash('sha256')
    .update(`${name}\0${sourceType}\0${sourceRef}`)
    .digest('hex')
    .slice(0, 12)
  return `${slugifySkillName(name)}-${hash}`
}

function buildContentCatalogId(name: string, contentHash: string): string {
  return buildCatalogId(name, 'content-hash', contentHash)
}

function sameInstance(left: SkillInstance, right: SkillInstance): boolean {
  return left.scope === right.scope && left.path === right.path && left.projectPath === right.projectPath
}

function hasMigratedInstance(skill: InventorySkill, next: InventoryState): boolean {
  return Object.values(next.skills).some(nextSkill =>
    skill.instances.some(instance =>
      nextSkill.instances.some(nextInstance => sameInstance(instance, nextInstance))
    )
  )
}

function toInstance(skill: DiscoveredSkill, projectPath?: string): SkillInstance {
  return {
    scope: skill.scope,
    path: skill.path,
    agents: skill.agents,
    projectPath,
  }
}

function mergeDiscovered(
  discovered: Array<DiscoveredSkill & { projectPath?: string }>,
  skill: DiscoveredSkill & { projectPath?: string }
): void {
  const existing = discovered.find(item =>
    item.scope === skill.scope && item.path === skill.path && item.projectPath === skill.projectPath
  )
  if (!existing) {
    discovered.push(skill)
    return
  }
  existing.agents = Array.from(new Set([...existing.agents, ...skill.agents]))
  if (!existing.description) existing.description = skill.description
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function discoverSkillsInDir(
  skillsDir: string,
  scope: 'global' | 'project',
  agents: string[],
  projectPath?: string
): Promise<Array<DiscoveredSkill & { projectPath?: string }>> {
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true })
    const discovered: Array<DiscoveredSkill & { projectPath?: string }> = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillPath = join(skillsDir, entry.name)
      if (!(await pathExists(join(skillPath, 'SKILL.md')))) continue
      const meta = await parseSkillMetadata(skillPath, entry.name)
      discovered.push({
        name: meta.name,
        description: meta.description,
        path: skillPath,
        scope,
        agents,
        ...(projectPath ? { projectPath } : {}),
      })
    }
    return discovered
  } catch {
    return []
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

async function computeSkillContentHash(skillPath: string): Promise<string | undefined> {
  const hash = createHash('sha256')

  async function visit(path: string, prefix = ''): Promise<void> {
    const entries = await readdir(path, { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const childPath = join(path, entry.name)
      const childPrefix = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await visit(childPath, childPrefix)
        continue
      }
      if (!entry.isFile()) continue
      hash.update(childPrefix)
      hash.update('\0')
      hash.update(await readFile(childPath))
      hash.update('\0')
    }
  }

  try {
    await visit(skillPath)
    return hash.digest('hex')
  } catch {
    return undefined
  }
}

async function resolveStoredSkillId(skill: InventorySkill): Promise<string> {
  const localSource = [skill.archivedPath, skill.reinstallSource, skill.source]
    .find((source): source is string => Boolean(source && isAbsolute(source)))
  const contentHash = localSource ? await computeSkillContentHash(localSource) : undefined
  if (contentHash) return buildContentCatalogId(skill.name, contentHash)

  const sourceRef = skill.reinstallSource || skill.source || skill.archivedPath || skill.id
  return buildCatalogId(skill.name, skill.sourceType || 'unknown', sourceRef)
}

async function resolveInstallSourceDir(source: string, skillName: string): Promise<string | undefined> {
  if (!isAbsolute(source)) return undefined
  if (await pathExists(join(source, 'SKILL.md'))) return source

  for (const candidate of [
    join(source, skillName),
    join(source, 'skills', skillName),
    join(source, '.agents', 'skills', skillName),
  ]) {
    if (await pathExists(join(candidate, 'SKILL.md'))) return candidate
  }

  return undefined
}

async function copySkillToTarget(sourceDir: string, targetDir: string): Promise<void> {
  await rm(targetDir, { recursive: true, force: true })
  await mkdir(dirname(targetDir), { recursive: true })
  await cp(sourceDir, targetDir, { recursive: true, dereference: true })
}

async function installProjectSkillCopy(skill: InventorySkill, projectPath: string, actionAgents: string[]): Promise<boolean> {
  const sourceDir = await resolveInstallSourceDir(skill.reinstallSource || skill.source || '', skill.name)
  if (!sourceDir) return false
  const targetDirs = new Set<string>()

  for (const agentId of normalizeAgentList(actionAgents)) {
    const agent = getManagedAgent(agentId)
    if (!agent) continue
    targetDirs.add(join(projectPath, agent.projectDir, skill.name))
  }
  if (targetDirs.size === 0) return false

  for (const targetDir of targetDirs) {
    await copySkillToTarget(sourceDir, targetDir)
  }

  return true
}

async function installGlobalSkillCopy(skill: InventorySkill, agents: string[]): Promise<boolean> {
  const sourceDir = await resolveInstallSourceDir(skill.reinstallSource || skill.source || '', skill.name)
  if (!sourceDir) return false
  const targetDirs = new Set<string>()

  for (const agentId of normalizeAgentList(agents)) {
    const agent = getManagedAgent(agentId)
    if (!agent) continue
    for (const globalDir of agent.globalDirs) {
      targetDirs.add(join(globalDir, skill.name))
    }
  }
  if (targetDirs.size === 0) return false

  for (const targetDir of targetDirs) {
    await copySkillToTarget(sourceDir, targetDir)
  }

  return true
}

async function resolveSourceSkillDirs(source: string): Promise<string[] | undefined> {
  if (!isAbsolute(source)) return undefined
  if (await pathExists(join(source, 'SKILL.md'))) return [source]

  const candidates = [source, join(source, 'skills'), join(source, '.agents', 'skills')]
  const skillDirs: string[] = []
  for (const candidate of candidates) {
    try {
      const entries = await readdir(candidate, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const skillDir = join(candidate, entry.name)
        if (await pathExists(join(skillDir, 'SKILL.md'))) {
          skillDirs.push(skillDir)
        }
      }
    } catch {
      // Not a directory layout we understand.
    }
  }

  return Array.from(new Set(skillDirs))
}

export interface InventoryManager {
  reconcile(projects: Project[]): Promise<InventoryState>
  listSkills(projects: Project[]): Promise<InventorySkill[]>
  getSkill(id: string, projects: Project[]): Promise<InventorySkill | undefined>
  resolveSkillRef(ref: string, projects: Project[]): Promise<InventorySkill | undefined>
  addGlobalSkillFromSource(source: string, projects: Project[], agents: string[]): Promise<void>
  enableProjectSkill(id: string, projectPath: string, actionAgents: string[], projects: Project[]): Promise<void>
  installGlobalSkill(id: string, projects: Project[], agents: string[]): Promise<void>
  disableProjectSkill(id: string, projectPath: string, actionAgents: string[]): Promise<void>
  updateGlobalSkill(id: string, projects: Project[], agents: string[]): Promise<void>
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
    const fsDiscoveryEnabled = process.env.SKILLS_UI_DISABLE_FS_DISCOVERY !== '1'

    if (fsDiscoveryEnabled) {
      const globalDirs = new Map<string, string[]>()
      for (const agent of MANAGED_AGENTS) {
        for (const globalDir of agent.globalDirs) {
          globalDirs.set(globalDir, [
            ...(globalDirs.get(globalDir) ?? []),
            getAgentDisplayName(agent.id),
          ])
        }
      }
      for (const [globalDir, agents] of globalDirs) {
        for (const skill of await discoverSkillsInDir(globalDir, 'global', agents)) {
          mergeDiscovered(discovered, skill)
        }
      }
    }

    try {
      for (const skill of await listInstalledSkills({ global: true })) {
        mergeDiscovered(discovered, skill)
      }
    } catch (err) {
      if (!(err instanceof SkillsCliError)) throw err
    }

    for (const project of projects) {
      if (fsDiscoveryEnabled) {
        const projectDirs = new Map<string, string[]>()
        for (const agentId of normalizeAgentList(project.agents)) {
          const agent = getManagedAgent(agentId)
          if (!agent) continue
          const projectDir = join(project.path, agent.projectDir)
          projectDirs.set(projectDir, [
            ...(projectDirs.get(projectDir) ?? []),
            getAgentDisplayName(agent.id),
          ])
        }
        for (const [projectDir, agents] of projectDirs) {
          for (const skill of await discoverSkillsInDir(projectDir, 'project', agents, project.path)) {
            mergeDiscovered(discovered, skill)
          }
        }
      }

      try {
        for (const skill of await listInstalledSkills({ cwd: project.path })) {
          mergeDiscovered(discovered, { ...skill, projectPath: project.path })
        }
      } catch (err) {
        if (err instanceof SkillsCliError) continue
        throw err
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
    const meta = await parseSkillMetadata(discovered.path, discovered.name)
    const computedContentHash = await computeSkillContentHash(discovered.path)
    const previousByInstance = await findPreviousSkillForInstance(discovered, previousSkills)
    const previousByContent = computedContentHash
      ? previousSkills.find(skill =>
        skill.id === buildContentCatalogId(discovered.name, computedContentHash) ||
        skill.id === buildContentCatalogId(meta.name, computedContentHash)
      )
      : undefined
    const previous = previousByInstance ?? previousByContent
    const globalLock = await globalLockPromise

    let source = previous?.source ?? meta.source ?? ''
    let reinstallSource = previous?.reinstallSource ?? ''
    let sourceType = previous?.sourceType ?? 'unknown'
    let reinstallable = previous?.reinstallable ?? false
    let archivedPath = previous?.archivedPath
    let contentHash = computedContentHash

    const globalEntry = globalLock.skills[discovered.name]
    if (discovered.scope === 'global' && globalEntry?.source) {
      source = globalEntry.sourceUrl || globalEntry.source
      reinstallSource = globalEntry.sourceUrl || globalEntry.source
      sourceType = globalEntry.sourceType || 'github'
      reinstallable = true
      contentHash = globalEntry.skillFolderHash
    }

    if (shouldArchiveDiscoveredSkill(sourceType, reinstallable, reinstallSource) && discovered.projectPath) {
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
        contentHash = localEntry.computedHash
      }
    }

    if (computedContentHash) contentHash = computedContentHash

    if (shouldArchiveDiscoveredSkill(sourceType, reinstallable, reinstallSource)) {
      const archiveSourcePath = archivedPath ?? discovered.path
      archivedPath = await ensureArchivedCopy(archiveSourcePath, discovered.name, archiveDir)
      reinstallSource = archivedPath
      reinstallable = true
      sourceType = 'archive'
      if (!source) source = archivedPath
    }

    const sourceRef = reinstallSource || source || archivedPath || discovered.path
    const id = contentHash
      ? buildContentCatalogId(discovered.name, contentHash)
      : buildCatalogId(discovered.name, sourceType, sourceRef)

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
        if (hasMigratedInstance(skill, next)) continue
        const preservedId = await resolveStoredSkillId(skill)
        if (next.skills[preservedId]) continue
        next.skills[preservedId] = { ...skill, id: preservedId, instances: [] }
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

    async addGlobalSkillFromSource(source, projects, agents) {
      const sourceDirs = await resolveSourceSkillDirs(source)
      if (sourceDirs && sourceDirs.length > 0) {
        for (const sourceDir of sourceDirs) {
          const meta = await parseSkillMetadata(sourceDir, slugifySkillName(sourceDir.split('/').pop() ?? 'skill'))
          const contentHash = await computeSkillContentHash(sourceDir)
          const skill: InventorySkill = {
            id: contentHash ? buildContentCatalogId(meta.name, contentHash) : buildCatalogId(meta.name, 'local', sourceDir),
            name: meta.name,
            description: meta.description,
            source,
            reinstallSource: sourceDir,
            reinstallable: true,
            sourceType: 'local',
            instances: [],
          }
          await installGlobalSkillCopy(skill, agents)
          const state = await read()
          state.skills[skill.id] = {
            ...(state.skills[skill.id] ?? skill),
            ...skill,
            instances: state.skills[skill.id]?.instances ?? [],
          }
          await write(state)
        }
        await this.reconcile(projects)
        return
      }

      await addSkill(source, { global: true, agents })
      await this.reconcile(projects)
    },

    async enableProjectSkill(id, projectPath, actionAgents, projects) {
      const inventory = await this.reconcile(projects)
      const skill = inventory.skills[id]
      if (!skill || !skill.reinstallable || !skill.reinstallSource) {
        throw new Error(`Skill "${id}" does not have a reinstall source`)
      }
      if (await installProjectSkillCopy(skill, projectPath, actionAgents)) {
        await this.reconcile(projects)
        return
      }
      await addSkill(skill.reinstallSource, {
        cwd: projectPath,
        skillNames: [skill.name],
        agents: actionAgents,
      })
      await this.reconcile(projects)
    },

    async installGlobalSkill(id, projects, agents) {
      const inventory = await this.reconcile(projects)
      const skill = inventory.skills[id]
      if (!skill || !skill.reinstallable || !skill.reinstallSource) {
        throw new Error(`Skill "${id}" does not have a reinstall source`)
      }
      if (await installGlobalSkillCopy(skill, agents)) {
        await this.reconcile(projects)
        return
      }
      await addSkill(skill.reinstallSource, {
        global: true,
        skillNames: [skill.name],
        agents,
      })
      await this.reconcile(projects)
    },

    async disableProjectSkill(id, projectPath, actionAgents) {
      const inventory = await read()
      const skill = inventory.skills[id]
      if (!skill) {
        throw new Error(`Skill "${id}" not found`)
      }
      const localLock = await readLocalSkillLock(projectPath)
      const localLockEntry = localLock.skills[skill.name]
      if (isRemoteSourceType(localLockEntry?.sourceType) || shouldUseSkillsCli(skill)) {
        await removeSkill(skill.name, { cwd: projectPath, agents: actionAgents })
        return
      }
      const targetDirs = new Set<string>()
      for (const agentId of actionAgents) {
        const agent = getManagedAgent(agentId)
        if (!agent) continue
        targetDirs.add(join(projectPath, agent.projectDir, skill.name))
      }

      if (targetDirs.size === 0) {
        await removeSkill(skill.name, { cwd: projectPath, agents: actionAgents })
        return
      }

      for (const targetDir of targetDirs) {
        await rm(targetDir, { recursive: true, force: true })
      }
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
      if (shouldUseSkillsCli(skill)) {
        await removeSkill(skill.name, { global: true })
        await this.reconcile(projects)
        return
      }
      const targetDirs = skill.instances
        .filter(instance => instance.scope === 'global')
        .map(instance => instance.path)
      if (targetDirs.length === 0) {
        await removeSkill(skill.name, { global: true })
        return
      }
      for (const targetDir of targetDirs) {
        await rm(targetDir, { recursive: true, force: true })
      }
    },

    async updateGlobalSkill(id, projects, agents) {
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
      if (await installGlobalSkillCopy(skill, agents)) {
        await this.reconcile(projects)
        return
      }
      await addSkill(skill.reinstallSource, {
        global: true,
        skillNames: [skill.name],
        agents,
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
