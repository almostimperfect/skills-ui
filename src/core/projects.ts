import { access } from 'fs/promises'
import { basename, join } from 'path'
import { readJson, writeJson } from './file-store.js'
import type { Config, Project } from './types.js'
import { AGENT_DIRS } from './constants.js'
import { normalizeAgentList } from './agents.js'

export interface ProjectRegistry {
  listProjects(): Promise<Project[]>
  getProject(projectPath: string): Promise<Project | undefined>
  getGlobalAgents(): Promise<string[]>
  updateGlobalAgents(agents: string[]): Promise<string[]>
  registerProject(projectPath: string, agents?: string[]): Promise<Project>
  updateProject(projectPath: string, updates: { name?: string; agents?: string[] }): Promise<Project>
  unregisterProject(projectPath: string): Promise<void>
}

export function createProjectRegistry(configPath: string): ProjectRegistry {
  async function read(): Promise<Config> {
    const config = await readJson<Config>(configPath, { projects: [] })
    const projects = config.projects.map(project => ({
      ...project,
      name: project.name || basename(project.path),
      agents: normalizeAgentList(project.agents),
    }))
    return {
      ...config,
      projects,
      ...(config.globalAgents ? { globalAgents: normalizeAgentList(config.globalAgents) } : {}),
    }
  }

  async function write(config: Config): Promise<void> {
    return writeJson(configPath, config)
  }

  async function detectAgents(projectPath: string): Promise<string[]> {
    const detected: string[] = []
    for (const [agentId, relDir] of Object.entries(AGENT_DIRS)) {
      try {
        await access(join(projectPath, relDir.split('/')[0]))
        detected.push(agentId)
      } catch {
        // directory doesn't exist, skip
      }
    }
    return detected
  }

  return {
    async listProjects() {
      const config = await read()
      return config.projects
    },

    async getProject(projectPath) {
      const config = await read()
      return config.projects.find(p => p.path === projectPath)
    },

    async getGlobalAgents() {
      const config = await read()
      const agents = normalizeAgentList(config.globalAgents ?? config.projects.flatMap(project => project.agents))
      return agents.length > 0 ? agents : ['codex']
    },

    async updateGlobalAgents(agents) {
      const config = await read()
      config.globalAgents = normalizeAgentList(agents)
      await write(config)
      return config.globalAgents
    },

    async registerProject(projectPath, agents) {
      const config = await read()
      const existing = config.projects.find(p => p.path === projectPath)
      if (existing) return existing

      const resolvedAgents = agents ?? (await detectAgents(projectPath))
      const project: Project = {
        path: projectPath,
        name: basename(projectPath),
        agents: normalizeAgentList(resolvedAgents),
      }
      config.projects.push(project)
      await write(config)
      return project
    },

    async updateProject(projectPath, updates) {
      const config = await read()
      const idx = config.projects.findIndex(p => p.path === projectPath)
      if (idx === -1) throw new Error(`Project not found: ${projectPath}`)
      const next: Project = { ...config.projects[idx] }
      if (updates.name !== undefined) next.name = updates.name
      if (updates.agents !== undefined) next.agents = normalizeAgentList(updates.agents)
      config.projects[idx] = {
        ...next,
      }
      await write(config)
      return config.projects[idx]
    },

    async unregisterProject(projectPath) {
      const config = await read()
      config.projects = config.projects.filter(p => p.path !== projectPath)
      await write(config)
    },
  }
}
