import { Router } from 'express'
import { isAbsolute } from 'path'
import { access } from 'fs/promises'
import { createProjectRegistry } from '../../core/projects.js'
import { createInventoryManager } from '../../core/inventory.js'
import { buildProjectSkillStatus } from '../../core/status.js'
import { ARCHIVE_DIR, CONFIG_PATH, INVENTORY_PATH } from '../../core/constants.js'

export function projectsRouter(): Router {
  const router = Router()
  const registry = createProjectRegistry(CONFIG_PATH)
  const inventory = createInventoryManager(INVENTORY_PATH, ARCHIVE_DIR)

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
      const projects = await registry.listProjects()
      await inventory.reconcile(projects)
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
      const projects = await registry.listProjects()
      const skills = await inventory.listSkills(projects)
      res.json({
        ...project,
        skills: skills.map(skill => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          source: skill.source,
          reinstallable: skill.reinstallable,
          status: buildProjectSkillStatus(skill, project),
        })),
      })
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
      const projects = await registry.listProjects()
      await inventory.reconcile(projects)
      res.status(204).send()
    } catch {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  return router
}
