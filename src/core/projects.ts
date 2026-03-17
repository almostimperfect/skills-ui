import { access } from 'fs/promises'
import { basename, join } from 'path'
import { readJson, writeJson } from './file-store.js'
import type { Config, Project } from './types.js'
import { AGENT_DIRS } from './constants.js'

export interface ProjectRegistry {
  listProjects(): Promise<Project[]>
  getProject(projectPath: string): Promise<Project | undefined>
  registerProject(projectPath: string, agents?: string[]): Promise<Project>
  updateProject(projectPath: string, updates: { name?: string; agents?: string[] }): Promise<Project>
  unregisterProject(projectPath: string): Promise<void>
}

export function createProjectRegistry(configPath: string): ProjectRegistry {
  async function read(): Promise<Config> {
    return readJson<Config>(configPath, { projects: [] })
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

    async registerProject(projectPath, agents) {
      const config = await read()
      const existing = config.projects.find(p => p.path === projectPath)
      if (existing) return existing

      const resolvedAgents = agents ?? (await detectAgents(projectPath))
      const project: Project = {
        path: projectPath,
        name: basename(projectPath),
        agents: resolvedAgents,
      }
      config.projects.push(project)
      await write(config)
      return project
    },

    async updateProject(projectPath, updates) {
      const config = await read()
      const idx = config.projects.findIndex(p => p.path === projectPath)
      if (idx === -1) throw new Error(`Project not found: ${projectPath}`)
      config.projects[idx] = { ...config.projects[idx], ...updates }
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
