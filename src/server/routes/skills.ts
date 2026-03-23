import { Router } from 'express'
import { addSkill, SkillsCliError } from '../../core/skills-cli.js'
import { getActionAgentsForStatus, buildProjectSkillStatus, buildSkillStatusMap } from '../../core/status.js'
import { createProjectRegistry } from '../../core/projects.js'
import { createInventoryManager } from '../../core/inventory.js'
import { getSkillMaintenance } from '../../core/maintenance.js'
import { ARCHIVE_DIR, CONFIG_PATH, INVENTORY_PATH, SUPPORTED_AGENTS } from '../../core/constants.js'
import { normalizeAgentId } from '../../core/agents.js'

function isAmbiguousSkillError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('ambiguous')
}

export function skillsRouter(): Router {
  const router = Router()
  const registry = createProjectRegistry(CONFIG_PATH)
  const inventory = createInventoryManager(INVENTORY_PATH, ARCHIVE_DIR)

  router.get('/', async (_req, res) => {
    try {
      const projects = await registry.listProjects()
      res.json(await inventory.listSkills(projects))
    } catch (err) {
      if (err instanceof SkillsCliError) {
        res.status(503).json({ error: err.message })
      } else {
        res.status(500).json({ error: 'Internal error' })
      }
    }
  })

  router.get('/:name', async (req, res) => {
    try {
      const projects = await registry.listProjects()
      const skill = await inventory.resolveSkillRef(req.params.name, projects)
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' })
        return
      }
      const status = buildSkillStatusMap(skill, projects)
      res.json({ ...skill, status })
    } catch (err) {
      if (isAmbiguousSkillError(err)) {
        res.status(409).json({ error: err instanceof Error ? err.message : 'Ambiguous skill reference' })
      } else {
        res.status(500).json({ error: 'Internal error' })
      }
    }
  })

  router.get('/:name/maintenance', async (req, res) => {
    try {
      const projects = await registry.listProjects()
      const skill = await inventory.resolveSkillRef(req.params.name, projects)
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' })
        return
      }
      res.json(await getSkillMaintenance(skill, projects))
    } catch (err) {
      if (isAmbiguousSkillError(err)) {
        res.status(409).json({ error: err instanceof Error ? err.message : 'Ambiguous skill reference' })
      } else {
        res.status(500).json({ error: 'Internal error' })
      }
    }
  })

  router.post('/', async (req, res) => {
    const { source } = req.body as { source?: string }
    if (!source) {
      res.status(400).json({ error: 'source is required' })
      return
    }
    try {
      await addSkill(source, { global: true })
      const projects = await registry.listProjects()
      await inventory.reconcile(projects)
      res.status(201).json({ ok: true })
    } catch (err) {
      if (isAmbiguousSkillError(err)) {
        res.status(409).json({ error: err instanceof Error ? err.message : 'Ambiguous skill reference' })
        return
      }
      if (err instanceof SkillsCliError) {
        res.status(422).json({ error: err.message })
      } else {
        res.status(500).json({ error: 'Internal error' })
      }
    }
  })

  router.delete('/:name', async (req, res) => {
    try {
      const projects = await registry.listProjects()
      const skill = await inventory.resolveSkillRef(req.params.name, projects)
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' })
        return
      }
      await inventory.removeGlobalSkill(skill.id, projects)
      await inventory.reconcile(projects)
      res.status(204).send()
    } catch (err) {
      if (isAmbiguousSkillError(err)) {
        res.status(409).json({ error: err instanceof Error ? err.message : 'Ambiguous skill reference' })
        return
      }
      if (err instanceof SkillsCliError) {
        res.status(422).json({ error: err.message })
      } else {
        res.status(500).json({ error: 'Internal error' })
      }
    }
  })

  router.post('/:name/update', async (req, res) => {
    try {
      const projects = await registry.listProjects()
      const skill = await inventory.resolveSkillRef(req.params.name, projects)
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' })
        return
      }
      await inventory.updateGlobalSkill(skill.id, projects)
      res.json({ ok: true })
    } catch (err) {
      if (isAmbiguousSkillError(err)) {
        res.status(409).json({ error: err instanceof Error ? err.message : 'Ambiguous skill reference' })
        return
      }
      if (err instanceof SkillsCliError) {
        res.status(422).json({ error: err.message })
      } else {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' })
      }
    }
  })

  router.post('/:name/enable', async (req, res) => {
    const { projectPath, agent } = req.body as { projectPath?: string; agent?: string }
    if (!projectPath || !agent) {
      res.status(400).json({ error: 'projectPath and agent are required' })
      return
    }
    const normalizedAgent = normalizeAgentId(agent)
    if (!(SUPPORTED_AGENTS as string[]).includes(normalizedAgent)) {
      res.status(400).json({ error: `agent must be one of: ${SUPPORTED_AGENTS.join(', ')}` })
      return
    }
    try {
      const projects = await registry.listProjects()
      const project = projects.find(p => p.path === projectPath)
      if (!project) {
        res.status(404).json({ error: 'Project not found' })
        return
      }
      const skill = await inventory.resolveSkillRef(req.params.name, projects)
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' })
        return
      }
      const projectStatus = buildProjectSkillStatus(skill, project)
      const agentStatus = projectStatus[normalizedAgent]
      if (!agentStatus?.canEnable) {
        res.status(409).json({ error: agentStatus?.reason || 'This skill cannot be enabled for that agent' })
        return
      }
      const actionAgents = getActionAgentsForStatus(project, normalizedAgent, agentStatus)
      await inventory.enableProjectSkill(skill.id, projectPath, actionAgents, projects)
      res.json({ ok: true })
    } catch (err) {
      if (isAmbiguousSkillError(err)) {
        res.status(409).json({ error: err instanceof Error ? err.message : 'Ambiguous skill reference' })
        return
      }
      if (err instanceof SkillsCliError) {
        res.status(422).json({ error: err.message })
      } else {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' })
      }
    }
  })

  router.post('/:name/disable', async (req, res) => {
    const { projectPath, agent } = req.body as { projectPath?: string; agent?: string }
    if (!projectPath || !agent) {
      res.status(400).json({ error: 'projectPath and agent are required' })
      return
    }
    const normalizedAgent = normalizeAgentId(agent)
    if (!(SUPPORTED_AGENTS as string[]).includes(normalizedAgent)) {
      res.status(400).json({ error: `agent must be one of: ${SUPPORTED_AGENTS.join(', ')}` })
      return
    }
    try {
      const projects = await registry.listProjects()
      const project = projects.find(p => p.path === projectPath)
      if (!project) {
        res.status(404).json({ error: 'Project not found' })
        return
      }
      const skill = await inventory.resolveSkillRef(req.params.name, projects)
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' })
        return
      }
      const projectStatus = buildProjectSkillStatus(skill, project)
      const agentStatus = projectStatus[normalizedAgent]
      if (!agentStatus?.canDisable) {
        res.status(409).json({ error: agentStatus?.reason || 'This skill cannot be disabled for that agent' })
        return
      }
      const actionAgents = getActionAgentsForStatus(project, normalizedAgent, agentStatus)
      await inventory.disableProjectSkill(skill.id, projectPath, actionAgents)
      await inventory.reconcile(projects)
      res.json({ ok: true })
    } catch (err) {
      if (isAmbiguousSkillError(err)) {
        res.status(409).json({ error: err instanceof Error ? err.message : 'Ambiguous skill reference' })
        return
      }
      if (err instanceof SkillsCliError) {
        res.status(422).json({ error: err.message })
      } else {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' })
      }
    }
  })

  router.post('/:name/split-global', async (req, res) => {
    try {
      const projects = await registry.listProjects()
      const skill = await inventory.resolveSkillRef(req.params.name, projects)
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' })
        return
      }
      if (!skill.reinstallable || !skill.reinstallSource) {
        res.status(409).json({ error: 'This skill does not have a reinstall source and cannot be split.' })
        return
      }
      await inventory.splitGlobalSkill(skill.id, projects)
      res.json({ ok: true })
    } catch (err) {
      if (isAmbiguousSkillError(err)) {
        res.status(409).json({ error: err instanceof Error ? err.message : 'Ambiguous skill reference' })
        return
      }
      if (err instanceof SkillsCliError) {
        res.status(422).json({ error: err.message })
      } else {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' })
      }
    }
  })

  return router
}
