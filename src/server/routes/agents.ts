import { Router } from 'express'
import { SUPPORTED_AGENTS } from '../../core/constants.js'
import { createProjectRegistry } from '../../core/projects.js'
import { CONFIG_PATH } from '../../core/constants.js'
import { normalizeAgentList } from '../../core/agents.js'

export function agentsRouter(): Router {
  const router = Router()
  const registry = createProjectRegistry(CONFIG_PATH)

  router.get('/', (_req, res) => {
    res.json(SUPPORTED_AGENTS)
  })

  router.get('/global', async (_req, res) => {
    try {
      res.json({
        supported: SUPPORTED_AGENTS,
        enabled: await registry.getGlobalAgents(),
      })
    } catch {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  router.patch('/global', async (req, res) => {
    const { agents } = req.body as { agents?: string[] }
    if (!Array.isArray(agents)) {
      res.status(400).json({ error: 'agents must be an array' })
      return
    }
    const normalized = normalizeAgentList(agents)
    if (normalized.length === 0) {
      res.status(400).json({ error: 'at least one global agent must be enabled' })
      return
    }
    const invalid = normalized.filter(agent => !(SUPPORTED_AGENTS as string[]).includes(agent))
    if (invalid.length > 0) {
      res.status(400).json({ error: `unsupported agents: ${invalid.join(', ')}` })
      return
    }
    try {
      res.json({
        supported: SUPPORTED_AGENTS,
        enabled: await registry.updateGlobalAgents(normalized),
      })
    } catch {
      res.status(500).json({ error: 'Internal error' })
    }
  })

  return router
}
