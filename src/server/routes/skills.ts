import { Router } from 'express'
import { listSkills, addSkill, removeSkill, SkillsCliError } from '../../core/skills-cli.js'
import { parseSkillMetadata } from '../../core/metadata.js'
import { createStateManager } from '../../core/state.js'
import { createProjectRegistry } from '../../core/projects.js'
import { CONFIG_PATH, STATE_PATH, AGENT_DIRS, CANONICAL_SKILLS_DIR, SUPPORTED_AGENTS } from '../../core/constants.js'
import { join } from 'path'
import { homedir } from 'os'
import { access } from 'fs/promises'

export function skillsRouter(): Router {
  const router = Router()
  const state = createStateManager(STATE_PATH)
  const registry = createProjectRegistry(CONFIG_PATH)

  router.get('/', async (_req, res) => {
    try {
      const skills = await listSkills()
      // Enrich each skill with metadata from SKILL.md frontmatter
      const globalSkillsDir = join(homedir(), CANONICAL_SKILLS_DIR)
      const enriched = await Promise.all(
        skills.map(async s => {
          const meta = await parseSkillMetadata(join(globalSkillsDir, s.name), s.name)
          return meta
        })
      )
      res.json(enriched)
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
      const { name } = req.params
      // Global skills are stored at ~/.agents/skills/ (installed with -g flag)
      const globalSkillsDir = join(homedir(), CANONICAL_SKILLS_DIR)
      const skillDir = join(globalSkillsDir, name)
      try {
        await access(skillDir)
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          res.status(404).json({ error: 'Skill not found' })
          return
        }
        throw err
      }
      const skill = await parseSkillMetadata(skillDir, name)
      const projects = await registry.listProjects()
      const status: Record<string, Record<string, 'enabled' | 'disabled'>> = {}
      for (const project of projects) {
        const disabled = await state.getDisabled(project.path)
        status[project.path] = {}
        for (const agent of project.agents) {
          status[project.path][agent] = disabled[agent]?.includes(name) ? 'disabled' : 'enabled'
        }
      }
      res.json({ ...skill, status })
    } catch {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  router.post('/', async (req, res) => {
    const { source } = req.body as { source?: string }
    if (!source) {
      res.status(400).json({ error: 'source is required' })
      return
    }
    try {
      await addSkill(source)
      res.status(201).json({ ok: true })
    } catch (err) {
      if (err instanceof SkillsCliError) {
        res.status(422).json({ error: err.message })
      } else {
        res.status(500).json({ error: 'Internal error' })
      }
    }
  })

  router.delete('/:name', async (req, res) => {
    try {
      const skillDir = join(homedir(), CANONICAL_SKILLS_DIR, req.params.name)
      try {
        await access(skillDir)
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          res.status(404).json({ error: 'Skill not found' })
          return
        }
        throw err
      }
      await removeSkill(req.params.name)
      await state.cleanupSkill(req.params.name)
      res.status(204).send()
    } catch (err) {
      if (err instanceof SkillsCliError) {
        res.status(422).json({ error: err.message })
      } else {
        res.status(500).json({ error: 'Internal error' })
      }
    }
  })

  router.post('/:name/enable', async (req, res) => {
    const { projectPath, agent } = req.body as { projectPath?: string; agent?: string }
    if (!projectPath || !agent) {
      res.status(400).json({ error: 'projectPath and agent are required' })
      return
    }
    if (!(SUPPORTED_AGENTS as string[]).includes(agent)) {
      res.status(400).json({ error: `agent must be one of: ${SUPPORTED_AGENTS.join(', ')}` })
      return
    }
    try {
      const project = await registry.getProject(projectPath)
      if (!project) {
        res.status(404).json({ error: 'Project not found' })
        return
      }
      if (!project.agents.includes(agent)) {
        res.status(400).json({ error: `agent ${agent} is not managed by this project` })
        return
      }
      await state.enable(projectPath, agent, req.params.name, AGENT_DIRS)
      res.json({ ok: true })
    } catch {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  router.post('/:name/disable', async (req, res) => {
    const { projectPath, agent } = req.body as { projectPath?: string; agent?: string }
    if (!projectPath || !agent) {
      res.status(400).json({ error: 'projectPath and agent are required' })
      return
    }
    if (!(SUPPORTED_AGENTS as string[]).includes(agent)) {
      res.status(400).json({ error: `agent must be one of: ${SUPPORTED_AGENTS.join(', ')}` })
      return
    }
    try {
      const project = await registry.getProject(projectPath)
      if (!project) {
        res.status(404).json({ error: 'Project not found' })
        return
      }
      if (!project.agents.includes(agent)) {
        res.status(400).json({ error: `agent ${agent} is not managed by this project` })
        return
      }
      await state.disable(projectPath, agent, req.params.name, AGENT_DIRS)
      res.json({ ok: true })
    } catch {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  return router
}
