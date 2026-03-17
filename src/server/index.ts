import express from 'express'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { agentsRouter } from './routes/agents.js'
import { skillsRouter } from './routes/skills.js'
import { projectsRouter } from './routes/projects.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export function createApp() {
  const app = express()
  app.use(express.json())

  // API routes
  app.use('/api/agents', agentsRouter())
  app.use('/api/skills', skillsRouter())
  app.use('/api/projects', projectsRouter())

  // Serve static web UI (only in production)
  const webDistPath = join(__dirname, '..', 'web')
  app.use(express.static(webDistPath))

  // Return a JSON 404 for unknown /api/* routes instead of falling through to the SPA
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  app.get('*', (_req, res) => {
    res.sendFile(join(webDistPath, 'index.html'))
  })

  return app
}

export function startServer(port: number): void {
  const app = createApp()
  app.listen(port, () => {
    console.log(`skills-ui running at http://localhost:${port}`)
  })
}
