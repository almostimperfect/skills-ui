// tests/core/file-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { readJson, writeJson } from '../../src/core/file-store.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'skills-ui-test-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true })
})

describe('readJson', () => {
  it('returns defaultValue when file does not exist', async () => {
    const result = await readJson(join(dir, 'missing.json'), { x: 1 })
    expect(result).toEqual({ x: 1 })
  })

  it('reads and parses existing file', async () => {
    const path = join(dir, 'data.json')
    await writeJson(path, { hello: 'world' })
    const result = await readJson(path, {})
    expect(result).toEqual({ hello: 'world' })
  })
})

describe('writeJson', () => {
  it('creates parent directories if needed', async () => {
    const path = join(dir, 'nested/deep/data.json')
    await writeJson(path, { a: 1 })
    const result = await readJson(path, {})
    expect(result).toEqual({ a: 1 })
  })

  it('concurrent writes produce consistent result', async () => {
    const path = join(dir, 'concurrent.json')
    // Ten concurrent writes — last one to queue wins
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => writeJson(path, { i }))
    )
    const result = await readJson<{ i: number }>(path, { i: -1 })
    expect(typeof result.i).toBe('number')
  })
})
