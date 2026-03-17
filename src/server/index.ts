import express from 'express'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { agentsRouter } from './routes/agents.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export function createApp() {
  const app = express()
  app.use(express.json())

  // API routes
  app.use('/api/agents', agentsRouter())

  // Serve static web UI (only in production)
  const webDistPath = join(__dirname, '..', 'web')
  app.use(express.static(webDistPath))
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
