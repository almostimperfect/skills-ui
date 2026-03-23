const BASE = '/api'

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }
  return res.json() as Promise<T>
}

export interface Skill {
  id: string
  name: string
  description: string
  source: string
  reinstallable?: boolean
  instances?: Array<{
    scope: 'global' | 'project'
    path: string
    agents: string[]
    projectPath?: string
  }>
}

export type SkillState = 'project' | 'global' | 'available' | 'unavailable'

export interface AgentSkillStatus {
  state: SkillState
  canEnable: boolean
  canDisable: boolean
  reason?: string
  sharedWith?: string[]
}

export type SkillUpdateStatus = 'up-to-date' | 'update-available' | 'unsupported' | 'error'

export interface SkillUpdateInfo {
  supported: boolean
  status: SkillUpdateStatus
  reason?: string
  installedAt?: string
  updatedAt?: string
  checkedAt: string
}

export interface SkillDriftInfo {
  projectPath: string
  paths: string[]
}

export interface SkillMaintenance {
  update: SkillUpdateInfo
  modifiedProjects: SkillDriftInfo[]
}

export interface SkillWithStatus extends Skill {
  status: Record<string, Record<string, AgentSkillStatus>>
}

export interface Project {
  path: string
  name: string
  agents: string[]
}

export interface ProjectWithMatrix extends Project {
  skills: Array<Skill & {
    status: Record<string, AgentSkillStatus>
  }>
}

// Skills
export const getSkills = () =>
  fetch(`${BASE}/skills`).then(r => json<Skill[]>(r))

export const getSkill = (id: string) =>
  fetch(`${BASE}/skills/${encodeURIComponent(id)}`).then(r => json<SkillWithStatus>(r))

export const addSkill = (source: string) =>
  fetch(`${BASE}/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  }).then(r => json<{ ok: boolean }>(r))

export const removeSkill = (id: string) =>
  fetch(`${BASE}/skills/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(r => {
    if (!r.ok) throw new Error(`Failed to remove skill: ${r.status}`)
  })

export const enableSkill = (id: string, projectPath: string, agent: string) =>
  fetch(`${BASE}/skills/${encodeURIComponent(id)}/enable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, agent }),
  }).then(r => json<{ ok: boolean }>(r))

export const disableSkill = (id: string, projectPath: string, agent: string) =>
  fetch(`${BASE}/skills/${encodeURIComponent(id)}/disable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, agent }),
  }).then(r => json<{ ok: boolean }>(r))

export const splitGlobalSkill = (id: string) =>
  fetch(`${BASE}/skills/${encodeURIComponent(id)}/split-global`, {
    method: 'POST',
  }).then(r => json<{ ok: boolean }>(r))

export const getSkillMaintenance = (id: string) =>
  fetch(`${BASE}/skills/${encodeURIComponent(id)}/maintenance`).then(r => json<SkillMaintenance>(r))

export const updateSkill = (id: string) =>
  fetch(`${BASE}/skills/${encodeURIComponent(id)}/update`, {
    method: 'POST',
  }).then(r => json<{ ok: boolean }>(r))

// Projects
export const getProjects = () =>
  fetch(`${BASE}/projects`).then(r => json<Project[]>(r))

export const getProject = (projectPath: string) =>
  fetch(`${BASE}/projects/${encodeURIComponent(projectPath)}`).then(r =>
    json<ProjectWithMatrix>(r)
  )

export const registerProject = (path: string, agents?: string[]) =>
  fetch(`${BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, agents }),
  }).then(r => json<Project>(r))

export const updateProject = (projectPath: string, updates: { name?: string; agents?: string[] }) =>
  fetch(`${BASE}/projects/${encodeURIComponent(projectPath)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  }).then(r => json<Project>(r))

export const unregisterProject = (projectPath: string) =>
  fetch(`${BASE}/projects/${encodeURIComponent(projectPath)}`, { method: 'DELETE' }).then(r => {
    if (!r.ok) throw new Error(`Failed to unregister project: ${r.status}`)
  })

// Agents
export const getAgents = () =>
  fetch(`${BASE}/agents`).then(r => json<string[]>(r))
