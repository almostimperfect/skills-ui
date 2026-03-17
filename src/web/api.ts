const BASE = '/api'

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${body}`)
  }
  return res.json() as Promise<T>
}

export interface Skill {
  name: string
  description: string
  source: string
}

export interface SkillWithStatus extends Skill {
  status: Record<string, Record<string, 'enabled' | 'disabled'>>
}

export interface Project {
  path: string
  name: string
  agents: string[]
}

export interface ProjectWithMatrix extends Project {
  matrix: Record<string, Record<string, 'enabled' | 'disabled'>>
}

// Skills
export const getSkills = () =>
  fetch(`${BASE}/skills`).then(r => json<Skill[]>(r))

export const getSkill = (name: string) =>
  fetch(`${BASE}/skills/${encodeURIComponent(name)}`).then(r => json<SkillWithStatus>(r))

export const addSkill = (source: string) =>
  fetch(`${BASE}/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  }).then(r => json<{ ok: boolean }>(r))

export const removeSkill = (name: string) =>
  fetch(`${BASE}/skills/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(r => {
    if (!r.ok) throw new Error(`Failed to remove skill: ${r.status}`)
  })

export const enableSkill = (name: string, projectPath: string, agent: string) =>
  fetch(`${BASE}/skills/${encodeURIComponent(name)}/enable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, agent }),
  }).then(r => json<{ ok: boolean }>(r))

export const disableSkill = (name: string, projectPath: string, agent: string) =>
  fetch(`${BASE}/skills/${encodeURIComponent(name)}/disable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, agent }),
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
