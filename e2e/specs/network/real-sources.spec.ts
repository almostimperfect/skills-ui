import { test, expect } from '@playwright/test'
import { execFile } from 'child_process'
import { mkdtemp, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const CLI_ENTRY = '/app/dist/cli/index.js'
const SKILLS_BIN = '/app/node_modules/.bin/skills'
const NETWORK_TIMEOUT = 300_000

interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

function isolatedEnv(home: string): NodeJS.ProcessEnv {
  return {
    CI: '1',
    HOME: home,
    PATH: process.env.PATH,
  }
}

function run(command: string, args: string[], home: string): Promise<CommandResult> {
  return new Promise(resolve => {
    execFile(command, args, {
      env: isolatedEnv(home),
      timeout: NETWORK_TIMEOUT,
    }, (error, stdout, stderr) => {
      const failure = error as (NodeJS.ErrnoException & { code?: number | string }) | null
      resolve({
        code: failure == null ? 0 : typeof failure.code === 'number' ? failure.code : 1,
        stdout: String(stdout),
        stderr: String(stderr),
      })
    })
  })
}

async function withIsolatedHome(runTest: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), 'skills-ui-network-'))
  try {
    await runTest(home)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}

async function installedSkillNames(home: string): Promise<string[]> {
  try {
    return await readdir(join(home, '.agents', 'skills'))
  } catch {
    return []
  }
}

test.describe('@network real remote sources', () => {
  test.describe.configure({ mode: 'serial', timeout: NETWORK_TIMEOUT + 30_000 })

  test('@network requires explicit opt-in', () => {
    expect(process.env.E2E_NETWORK).toBe('1')
  })

  test('@network installs a single-skill repository from a Git URL', async () => {
    await withIsolatedHome(async home => {
      const result = await run('node', [CLI_ENTRY, 'add', 'https://github.com/op7418/Humanizer-zh.git'], home)

      expect(result.code, result.stderr).toBe(0)
      expect(await installedSkillNames(home)).toContain('humanizer-zh')
    })
  })

  test('@network installs an owner/repository shorthand source', async () => {
    await withIsolatedHome(async home => {
      const result = await run('node', [CLI_ENTRY, 'add', 'almostimperfect/codex-ppt-skills'], home)

      expect(result.code, result.stderr).toBe(0)
      expect((await installedSkillNames(home)).length).toBeGreaterThan(0)
    })
  })

  test('@network selects one skill from a multi-skill repository', async () => {
    await withIsolatedHome(async home => {
      const result = await run(SKILLS_BIN, [
        'add',
        'https://github.com/anthropics/skills',
        '--skill',
        'skill-creator',
        '--agent',
        'codex',
        '-g',
        '-y',
      ], home)

      expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
      expect(await installedSkillNames(home)).toContain('skill-creator')
    })
  })

  test('@network API installation uses the container-only HOME', async ({ request }) => {
    const response = await request.post('/api/skills', {
      data: { source: 'https://github.com/op7418/Humanizer-zh.git' },
      timeout: NETWORK_TIMEOUT,
    })

    expect(response.status(), await response.text()).toBe(201)
    const skills = await request.get('/api/skills')
    expect(await skills.text()).toContain('humanizer-zh')
  })

  test('@network reports a nonexistent repository without a stack trace', async () => {
    await withIsolatedHome(async home => {
      const result = await run('node', [CLI_ENTRY, 'add', 'this-org-does-not-exist-9x9x9/nope'], home)

      expect(result.code).toBe(1)
      expect(result.stderr).toContain('Error:')
      expect(result.stderr).not.toContain('    at ')
    })
  })
})
