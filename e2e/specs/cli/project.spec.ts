/**
 * CLI functional E2E: project registration.
 */
import { test, expect } from '../../helpers/env.js'
import { runCli } from '../../helpers/cli.js'
import { mkdir } from 'fs/promises'
import { join } from 'path'

test.describe('CLI: project add', () => {
  test('CLI-PROJ-01: registers an existing absolute path with agent auto-detection', async ({ server }) => {
    const dir = join(server.home, 'projects', 'detect-me')
    await mkdir(join(dir, '.claude'), { recursive: true })
    await mkdir(join(dir, '.codex'), { recursive: true })

    const res = await runCli(server.home, ['project', 'add', dir])
    expect(res.code, res.stderr).toBe(0)
    expect(res.stdout).toContain('✓ Registered detect-me')
    expect(res.stdout).toContain('claude-code')
    expect(res.stdout).toContain('codex')

    const list = await runCli(server.home, ['projects'])
    expect(list.stdout).toContain('detect-me')
  })

  test('CLI-PROJ-02: --agents override wins over auto-detection', async ({ server }) => {
    const dir = join(server.home, 'projects', 'explicit')
    await mkdir(join(dir, '.claude'), { recursive: true })
    const res = await runCli(server.home, ['project', 'add', dir, '--agents', 'codex,gemini'])
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('codex')
    expect(res.stdout).toContain('gemini')
    expect(res.stdout).not.toContain('claude-code')
  })

  test('CLI-PROJ-05: re-registering the same path does not duplicate', async ({ server }) => {
    const dir = join(server.home, 'projects', 'twice')
    await mkdir(dir, { recursive: true })
    await runCli(server.home, ['project', 'add', dir])
    await runCli(server.home, ['project', 'add', dir])
    const list = await runCli(server.home, ['projects'])
    // Count project LINES (the name also appears in the path, so substring counting lies)
    const lines = list.stdout.split('\n').filter(l => l.includes('twice'))
    expect(lines.length).toBe(1)
  })

  test('UX-003/F-CLI-01: registering a NONEXISTENT path must fail, not print ✓', async ({ server }) => {
    const res = await runCli(server.home, ['project', 'add', '/definitely/not/here'])
    // DESIRED: exit 1 + "does not exist" (parity with POST /api/projects).
    // ACTUAL today: resolve()d and registered with "✓ Registered".
    expect(res.code).toBe(1)
    expect(res.stderr).toMatch(/exist/i)
  })

  test('UX-003/CLI-PROJ-04: relative project paths are rejected consistently with the API', async ({ server }) => {
    const parent = join(server.home, 'projects')
    await mkdir(join(parent, 'relproj'), { recursive: true })
    const res = await runCli(server.home, ['project', 'add', './relproj'], { cwd: parent })
    expect(res.code).toBe(1)
    expect(res.stderr).toMatch(/absolute/i)
  })
})

test.describe('CLI: serve edge', () => {
  test('CLI-SERVE-02: invalid --port values are rejected with the valid range', async ({ server }) => {
    for (const bad of ['99999', 'abc', '0']) {
      const res = await runCli(server.home, ['serve', '--port', bad])
      expect(res.code, `port=${bad}`).toBe(1)
      expect(res.stderr).toContain('invalid port')
      expect(res.stderr).toContain('between 1 and 65535')
    }
  })
})
