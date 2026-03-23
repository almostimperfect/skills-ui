import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import { readFile, readdir } from 'fs/promises'
import { join, relative } from 'path'
import { readGlobalSkillLock, readLocalSkillLock } from './skills-lock.js'
import type {
  InventorySkill,
  Project,
  SkillDriftInfo,
  SkillMaintenanceInfo,
  SkillUpdateInfo,
} from './types.js'

function nowIso(): string {
  return new Date().toISOString()
}

function getSkipReason(entry: Awaited<ReturnType<typeof readGlobalSkillLock>>['skills'][string] | undefined): string {
  if (entry?.sourceType === 'local') return 'Local path'
  if (entry?.sourceType === 'git') return 'Git URL (hash tracking not supported)'
  if (!entry?.skillFolderHash) return 'No version hash available'
  if (!entry.skillPath) return 'No skill path recorded'
  return 'No version tracking'
}

function getGitHubToken(): string | null {
  const envToken = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim()
  if (envToken) return envToken
  try {
    const token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return token || null
  } catch {
    return null
  }
}

async function fetchGitHubSkillFolderHash(ownerRepo: string, skillPath: string, token: string | null): Promise<string | null> {
  let folderPath = skillPath.replace(/\\/g, '/')
  if (folderPath.endsWith('/SKILL.md')) folderPath = folderPath.slice(0, -9)
  else if (folderPath.endsWith('SKILL.md')) folderPath = folderPath.slice(0, -8)
  if (folderPath.endsWith('/')) folderPath = folderPath.slice(0, -1)

  for (const branch of ['main', 'master']) {
    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'skills-ui',
      }
      if (token) headers.Authorization = `Bearer ${token}`

      const response = await fetch(`https://api.github.com/repos/${ownerRepo}/git/trees/${branch}?recursive=1`, {
        headers,
      })
      if (!response.ok) continue

      const data = await response.json() as {
        sha?: string
        tree?: Array<{ type?: string; path?: string; sha?: string }>
      }
      if (!folderPath) return data.sha ?? null

      const folderEntry = data.tree?.find(entry => entry.type === 'tree' && entry.path === folderPath)
      if (folderEntry?.sha) return folderEntry.sha
    } catch {
      continue
    }
  }

  return null
}

async function collectFiles(baseDir: string, currentDir: string, results: Array<{ relativePath: string; content: Buffer }>): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true })
  await Promise.all(entries.map(async entry => {
    const fullPath = join(currentDir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') return
      await collectFiles(baseDir, fullPath, results)
      return
    }
    if (entry.isFile()) {
      results.push({
        relativePath: relative(baseDir, fullPath).split('\\').join('/'),
        content: await readFile(fullPath),
      })
    }
  }))
}

async function computeSkillFolderHash(skillDir: string): Promise<string> {
  const files: Array<{ relativePath: string; content: Buffer }> = []
  await collectFiles(skillDir, skillDir, files)
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(file.relativePath)
    hash.update(file.content)
  }
  return hash.digest('hex')
}

async function getUpdateInfo(skill: InventorySkill): Promise<SkillUpdateInfo> {
  const checkedAt = nowIso()
  if (!skill.instances.some(instance => instance.scope === 'global')) {
    return {
      supported: false,
      status: 'unsupported',
      reason: 'No managed global installation exists for this skill.',
      checkedAt,
    }
  }

  const globalLock = await readGlobalSkillLock()
  const entry = globalLock.skills[skill.name]
  if (!entry) {
    return {
      supported: false,
      status: 'unsupported',
      reason: 'This global skill is not tracked in .skill-lock.json.',
      checkedAt,
    }
  }

  const base: Pick<SkillUpdateInfo, 'installedAt' | 'updatedAt' | 'checkedAt'> = {
    installedAt: entry.installedAt,
    updatedAt: entry.updatedAt,
    checkedAt,
  }

  if (entry.sourceType !== 'github' || !entry.skillFolderHash || !entry.skillPath || !entry.source) {
    return {
      supported: false,
      status: 'unsupported',
      reason: getSkipReason(entry),
      ...base,
    }
  }

  const latestHash = await fetchGitHubSkillFolderHash(entry.source, entry.skillPath, getGitHubToken())
  if (!latestHash) {
    return {
      supported: true,
      status: 'error',
      reason: 'Could not fetch the latest version hash from GitHub.',
      ...base,
    }
  }

  return {
    supported: true,
    status: latestHash === entry.skillFolderHash ? 'up-to-date' : 'update-available',
    ...base,
  }
}

async function getModifiedProjects(skill: InventorySkill, projects: Project[]): Promise<SkillDriftInfo[]> {
  const projectPaths = Array.from(new Set(
    skill.instances
      .filter(instance => instance.scope === 'project' && instance.projectPath)
      .map(instance => instance.projectPath as string)
  ))
  const managedProjectPaths = new Set(projects.map(project => project.path))
  const modified: SkillDriftInfo[] = []

  for (const projectPath of projectPaths) {
    if (!managedProjectPaths.has(projectPath)) continue

    const lockEntry = (await readLocalSkillLock(projectPath)).skills[skill.name]
    if (!lockEntry?.computedHash) continue

    const projectPathsForSkill = Array.from(new Set(
      skill.instances
        .filter(instance => instance.scope === 'project' && instance.projectPath === projectPath)
        .map(instance => instance.path)
    ))
    const modifiedPaths: string[] = []

    for (const path of projectPathsForSkill) {
      try {
        const currentHash = await computeSkillFolderHash(path)
        if (currentHash !== lockEntry.computedHash) {
          modifiedPaths.push(path)
        }
      } catch {
        modifiedPaths.push(path)
      }
    }

    if (modifiedPaths.length > 0) {
      modified.push({ projectPath, paths: modifiedPaths })
    }
  }

  return modified
}

export async function getSkillMaintenance(skill: InventorySkill, projects: Project[]): Promise<SkillMaintenanceInfo> {
  const [update, modifiedProjects] = await Promise.all([
    getUpdateInfo(skill),
    getModifiedProjects(skill, projects),
  ])

  return {
    update,
    modifiedProjects,
  }
}
