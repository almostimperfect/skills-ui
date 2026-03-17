import { Router } from 'express'
import { SUPPORTED_AGENTS } from '../../core/constants.js'

export function agentsRouter(): Router {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json(SUPPORTED_AGENTS)
  })

  return router
}
