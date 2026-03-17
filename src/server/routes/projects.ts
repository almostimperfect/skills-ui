import { Router } from 'express'
import { isAbsolute } from 'path'
import { access } from 'fs/promises'
import { createProjectRegistry } from '../../core/projects.js'
import { createStateManager } from '../../core/state.js'
import { listSkills } from '../../core/skills-cli.js'
import { CONFIG_PATH, STATE_PATH } from '../../core/constants.js'

export function projectsRouter(): Router {
  const router = Router()
  const registry = createProjectRegistry(CONFIG_PATH)
  const state = createStateManager(STATE_PATH)

  router.get('/', async (_req, res) => {
    try {
      const projects = await registry.listProjects()
      res.json(projects)
    } catch {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  router.post('/', async (req, res) => {
    const { path: projectPath, agents } = req.body as { path?: string; agents?: string[] }
    if (!projectPath) {
      res.status(400).json({ error: 'path is required' })
      return
    }
    if (!isAbsolute(projectPath)) {
      res.status(400).json({ error: 'path must be an absolute path' })
      return
    }
    try {
      await access(projectPath)
    } catch {
      res.status(400).json({ error: 'path does not exist or is not accessible' })
      return
    }
    try {
      const project = await registry.registerProject(projectPath, agents)
      res.status(201).json(project)
    } catch {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  router.get('/:projectPath', async (req, res) => {
    const projectPath = decodeURIComponent(req.params.projectPath)
    try {
      const project = await registry.getProject(projectPath)
      if (!project) {
        res.status(404).json({ error: 'Project not found' })
        return
      }
      const skills = await listSkills()
      const matrix: Record<string, Record<string, 'enabled' | 'disabled'>> = {}
      for (const skill of skills) {
        matrix[skill.name] = {}
        for (const agent of project.agents) {
          const disabled = await state.isDisabled(projectPath, agent, skill.name)
          matrix[skill.name][agent] = disabled ? 'disabled' : 'enabled'
        }
      }
      res.json({ ...project, matrix })
    } catch {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  router.patch('/:projectPath', async (req, res) => {
    const projectPath = decodeURIComponent(req.params.projectPath)
    const { name, agents } = req.body as { name?: string; agents?: string[] }
    try {
      const updated = await registry.updateProject(projectPath, { name, agents })
      res.json(updated)
    } catch (err: unknown) {
      if ((err as Error).message?.includes('not found')) {
        res.status(404).json({ error: 'Project not found' })
      } else {
        res.status(500).json({ error: 'Internal error' })
      }
    }
  })

  router.delete('/:projectPath', async (req, res) => {
    const projectPath = decodeURIComponent(req.params.projectPath)
    try {
      await registry.unregisterProject(projectPath)
      await state.cleanupProject(projectPath)
      res.status(204).send()
    } catch {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  return router
}
