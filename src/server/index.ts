import express from 'express'
import type { Server } from 'http'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { DEFAULT_PORT } from '../core/constants.js'
import { agentsRouter } from './routes/agents.js'
import { skillsRouter } from './routes/skills.js'
import { projectsRouter } from './routes/projects.js'
import { overviewRouter } from './routes/overview.js'
import { createLocalSessionBoundary, LOOPBACK_HOST } from './session-boundary.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export interface CreateAppOptions {
  port?: number
  webDistPath?: string
}

export function createApp(optionsOrWebDistPath?: CreateAppOptions | string) {
  const options = typeof optionsOrWebDistPath === 'string'
    ? { webDistPath: optionsOrWebDistPath }
    : optionsOrWebDistPath ?? {}
  const port = options.port ?? DEFAULT_PORT
  const authority = `${LOOPBACK_HOST}:${port}`
  const sessionBoundary = createLocalSessionBoundary({ authority })
  const app = express()
  app.disable('x-powered-by')
  app.disable('trust proxy')
  app.use(sessionBoundary.securityHeaders)
  app.use(sessionBoundary.requireExpectedHost)

  app.get('/healthz', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.type('text/plain').send('ok')
  })

  app.post('/api/session', sessionBoundary.bootstrapSession)
  app.use('/api', sessionBoundary.requireApiSession)
  app.use(express.json({ limit: '1mb', type: 'application/json' }))

  // API routes
  app.use('/api/agents', agentsRouter())
  app.use('/api/skills', skillsRouter())
  app.use('/api/projects', projectsRouter())
  app.use('/api/overview', overviewRouter())

  // Serve static web UI (only in production)
  const webDistPath = options.webDistPath ?? join(__dirname, '..', 'web')
  const webIndexPath = join(webDistPath, 'index.html')
  app.use(express.static(webDistPath))

  // Return a JSON 404 for unknown /api/* routes instead of falling through to the SPA
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  app.get('*', (_req, res) => {
    if (!existsSync(webIndexPath)) {
      res.status(503).send('Web UI is not built. Run npm run build.')
      return
    }
    res.sendFile(webIndexPath)
  })

  return app
}

export function startServer(port: number): Server {
  const app = createApp({ port })
  const server = app.listen(port, LOOPBACK_HOST, () => {
    const address = server.address()
    const boundPort = typeof address === 'object' && address ? address.port : port
    console.log(`skills-ui running at http://${LOOPBACK_HOST}:${boundPort}`)
  })
  return server
}
