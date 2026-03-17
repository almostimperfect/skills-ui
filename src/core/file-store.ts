import { readFile, writeFile, mkdir, rename } from 'fs/promises'
import { dirname } from 'path'
import { randomBytes } from 'crypto'

// Serial write queue per file path — prevents concurrent write races
const writeQueues = new Map<string, Promise<void>>()

export async function readJson<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultValue
    throw err
  }
}

export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  const prev = writeQueues.get(filePath) ?? Promise.resolve()
  const next = prev.then(() => atomicWrite(filePath, data))
  // Suppress errors in the queued chain so a failed write doesn't stall future writes.
  // Clean up the map entry once this write settles so the chain doesn't grow indefinitely.
  const queued = next.catch(() => {}).finally(() => {
    if (writeQueues.get(filePath) === queued) writeQueues.delete(filePath)
  })
  writeQueues.set(filePath, queued)
  await next
}

async function atomicWrite<T>(filePath: string, data: T): Promise<void> {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })
  const tmp = `${filePath}.${randomBytes(6).toString('hex')}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
  await rename(tmp, filePath)
}
