import { access } from 'fs/promises'
import { Router } from 'express'
import { buildProductOverview } from '../../core/overview.js'
import { createInventoryManager } from '../../core/inventory.js'
import { getSkillMaintenance } from '../../core/maintenance.js'
import { createProjectRegistry } from '../../core/projects.js'
import { ARCHIVE_DIR, CONFIG_PATH, INVENTORY_PATH } from '../../core/constants.js'
import type { InventorySkill, Project, SkillMaintenanceInfo } from '../../core/types.js'

export function overviewRouter(): Router {
  const router = Router()
  const registry = createProjectRegistry(CONFIG_PATH)
  const inventory = createInventoryManager(INVENTORY_PATH, ARCHIVE_DIR)

  async function overview(skills: InventorySkill[], projects: Project[]) {
    const maintenance = new Map<string, SkillMaintenanceInfo>()
    await Promise.all(skills.map(async skill => {
      maintenance.set(skill.id, await getSkillMaintenance(skill, projects))
    }))
    const missing = new Set<string>()
    await Promise.all(projects.map(async project => {
      try { await access(project.path) } catch { missing.add(project.path) }
    }))
    return buildProductOverview(skills, projects, maintenance, missing)
  }

  router.get('/', async (_req, res) => {
    try {
      const projects = await registry.listProjects()
      res.json(await overview(await inventory.listSkills(projects), projects))
    } catch {
      res.status(500).json({ error: 'The product overview could not be generated.' })
    }
  })

  router.post('/reconcile', async (_req, res) => {
    try {
      const projects = await registry.listProjects()
      const state = await inventory.reconcile(projects)
      res.json(await overview(Object.values(state.skills), projects))
    } catch {
      res.status(500).json({ error: 'The inventory scan could not be completed.' })
    }
  })

  return router
}
