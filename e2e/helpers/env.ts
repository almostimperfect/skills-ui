/**
 * Playwright harness for skills-ui E2E.
 *
 * Isolation model (hard rule 6 of the approved plan):
 *  - Each Playwright WORKER gets a unique $HOME derived AT RUNTIME from
 *    `workerInfo.workerIndex` (never a module-level constant — src/core/constants.ts
 *    resolves homedir() at import time, so the spawned server binds paths from the
 *    HOME we inject into its environment).
 *  - One real `skills-ui serve` server per worker, on a worker-unique port.
 *  - Every TEST starts from a wiped store ($HOME/.skills-ui, $HOME/.agents,
 *    $HOME/projects) — safe because src/core/file-store.ts re-reads state on every
 *    request; the server holds no in-memory cache.
 */
import { test as base } from '@playwright/test'
import { spawn, type ChildProcess } from 'child_process'
import { mkdir, rm } from 'fs/promises'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/** Repo root inside the container/image (= /app when built via Dockerfile.e2e). */
export const REPO_ROOT = resolve(__dirname, '..', '..')
export const CLI_ENTRY = join(REPO_ROOT, 'dist', 'cli', 'index.js')
export const FIXTURES = resolve(__dirname, '..', 'fixtures')

export interface ServerHandle {
  /** Base URL of the worker's skills-ui server, e.g. http://127.0.0.1:4101 */
  url: string
  /** The isolated $HOME this worker's server (and CLI spawns) must use */
  home: string
  port: number
}

async function waitForReady(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
      lastErr = new Error(`status ${res.status}`)
    } catch (e) {
      lastErr = e
    }
    await new Promise(r => setTimeout(r, 150))
  }
  throw new Error(`server at ${url} not ready in ${timeoutMs}ms: ${String(lastErr)}`)
}

export async function wipeStore(home: string): Promise<void> {
  await rm(join(home, '.skills-ui'), { recursive: true, force: true })
  await rm(join(home, '.agents'), { recursive: true, force: true })
  await rm(join(home, 'projects'), { recursive: true, force: true })
}

interface WorkerFixtures {
  workerServer: ServerHandle
}

interface TestFixtures {
  /** Worker server with a per-test wiped store. Use this, not workerServer. */
  server: ServerHandle
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  workerServer: [
    async ({}, use, workerInfo) => {
      // Runtime-derived per-worker HOME — hard rule 6.
      const home = join('/tmp', 'skills-ui-e2e', `home-${workerInfo.workerIndex}`)
      await rm(home, { recursive: true, force: true })
      await mkdir(home, { recursive: true })

      const port = 4100 + workerInfo.workerIndex
      const child: ChildProcess = spawn('node', [CLI_ENTRY, 'serve', '--port', String(port)], {
        env: { ...process.env, HOME: home },
        stdio: 'pipe',
      })
      const stderrBuf: string[] = []
      child.stderr?.on('data', d => stderrBuf.push(String(d)))
      try {
        await waitForReady(`http://127.0.0.1:${port}/api/agents`)
      } catch (e) {
        child.kill('SIGKILL')
        throw new Error(`${String(e)}\nserver stderr:\n${stderrBuf.join('')}`)
      }

      await use({ url: `http://127.0.0.1:${port}`, home, port })

      child.kill('SIGTERM')
      await rm(home, { recursive: true, force: true })
    },
    { scope: 'worker' },
  ],

  server: async ({ workerServer }, use) => {
    await wipeStore(workerServer.home)
    await use(workerServer)
  },

  // Point the page/request fixtures at this worker's server.
  baseURL: async ({ server }, use) => {
    await use(server.url)
  },
})

export { expect } from '@playwright/test'
