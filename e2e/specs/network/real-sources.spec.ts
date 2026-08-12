import { test, expect } from '@playwright/test'
import { execFile } from 'child_process'
import { lookup } from 'dns/promises'
import { mkdir, mkdtemp, readdir, rm } from 'fs/promises'
import { connect } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'

const CLI_ENTRY = '/app/dist/cli/index.js'
const SKILLS_BIN = '/app/node_modules/.bin/skills'
const NETWORK_TIMEOUT = 300_000
const CONNECTIVITY_TIMEOUT = 5_000
const SAFE_PATH = '/usr/local/bin:/usr/bin:/bin'
const SERVICE_ORIGIN = 'http://127.0.0.1:3456'
const CSRF_HEADER = 'X-Skills-UI-CSRF'

const NETWORK_ENV_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'NO_PROXY',
  'no_proxy',
  'DISABLE_TELEMETRY',
  'DO_NOT_TRACK',
  'NODE_USE_ENV_PROXY',
  'SKILLS_UI_HTTPS_PROXY',
  'GIT_ALLOW_PROTOCOL',
  'GIT_TERMINAL_PROMPT',
  'GIT_CONFIG_NOSYSTEM',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_KEY_0',
  'GIT_CONFIG_VALUE_0',
  'GIT_CONFIG_KEY_1',
  'GIT_CONFIG_VALUE_1',
  'GIT_CONFIG_KEY_2',
  'GIT_CONFIG_VALUE_2',
  'GIT_CONFIG_KEY_3',
  'GIT_CONFIG_VALUE_3',
  'GIT_CONFIG_KEY_4',
  'GIT_CONFIG_VALUE_4',
] as const

const FORBIDDEN_HOST_ENV_KEYS = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'DOCKER_HOST',
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'NODE_AUTH_TOKEN',
  'NPM_TOKEN',
  'SSH_AUTH_SOCK',
] as const

interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

function isolatedEnv(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    CI: '1',
    HOME: home,
    PATH: SAFE_PATH,
    TMPDIR: join(home, 'tmp'),
    XDG_CACHE_HOME: join(home, '.cache'),
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
    XDG_RUNTIME_DIR: join(home, '.runtime'),
    XDG_STATE_HOME: join(home, '.local', 'state'),
  }
  for (const key of NETWORK_ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  return env
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
    await Promise.all([
      mkdir(join(home, 'tmp'), { recursive: true, mode: 0o700 }),
      mkdir(join(home, '.cache'), { recursive: true, mode: 0o700 }),
      mkdir(join(home, '.config'), { recursive: true, mode: 0o700 }),
      mkdir(join(home, '.local', 'share'), { recursive: true, mode: 0o700 }),
      mkdir(join(home, '.local', 'state'), { recursive: true, mode: 0o700 }),
      mkdir(join(home, '.runtime'), { recursive: true, mode: 0o700 }),
    ])
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

function canConnectDirectly(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect({ host, port })
    let settled = false
    const finish = (connected: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(connected)
    }
    socket.setTimeout(CONNECTIVITY_TIMEOUT, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

function proxyConnectStatus(authority: string): Promise<number> {
  return new Promise(resolve => {
    const proxyValue = process.env.HTTPS_PROXY
    if (!proxyValue) {
      resolve(0)
      return
    }

    const proxy = new URL(proxyValue)
    const socket = connect({
      host: proxy.hostname,
      port: Number.parseInt(proxy.port || '80', 10),
    })
    let settled = false
    let response = ''
    const finish = (status: number) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(status)
    }

    socket.setTimeout(CONNECTIVITY_TIMEOUT, () => finish(0))
    socket.once('error', () => finish(0))
    socket.once('connect', () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\nConnection: close\r\n\r\n`)
    })
    socket.on('data', chunk => {
      response += chunk.toString('ascii')
      const firstLineEnd = response.indexOf('\r\n')
      if (firstLineEnd === -1) return
      const match = /^HTTP\/1\.[01] ([0-9]{3}) /.exec(response.slice(0, firstLineEnd))
      finish(match ? Number.parseInt(match[1], 10) : 0)
    })
  })
}

async function canResolveExternally(hostname: string): Promise<boolean> {
  try {
    await lookup(hostname)
    return true
  } catch {
    return false
  }
}

test.describe('@network real remote sources', () => {
  test.describe.configure({ mode: 'serial', timeout: NETWORK_TIMEOUT + 30_000 })

  test('@network requires explicit opt-in', () => {
    expect(process.env.E2E_NETWORK).toBe('1')
    expect(process.env.HOME).toMatch(/^\/tmp\/skills-ui-e2e-[^/]+\/home$/)
    expect(process.env.TMPDIR).toBe(`${process.env.HOME}/tmp`)
    expect(process.env.XDG_CONFIG_HOME).toBe(`${process.env.HOME}/.config`)
    expect(process.env.XDG_CACHE_HOME).toBe(`${process.env.HOME}/.cache`)
    expect(process.env.XDG_DATA_HOME).toBe(`${process.env.HOME}/.local/share`)
    expect(process.env.XDG_RUNTIME_DIR).toBe(`${process.env.HOME}/.runtime`)
    expect(process.env.XDG_STATE_HOME).toBe(`${process.env.HOME}/.local/state`)
    expect(process.env.PATH).toBe(SAFE_PATH)
    expect(process.env.HTTPS_PROXY).toMatch(/^http:\/\/[0-9]+(?:\.[0-9]+){3}:8080$/)
    expect(process.env.DISABLE_TELEMETRY).toBe('1')
    expect(process.env.DO_NOT_TRACK).toBe('1')
    expect(process.env.NODE_USE_ENV_PROXY).toBe('1')
    expect(process.env.GIT_ALLOW_PROTOCOL).toBe('https')
    for (const key of FORBIDDEN_HOST_ENV_KEYS) {
      expect(process.env[key], `${key} must not enter the network test container`).toBeUndefined()
    }
  })

  test('@network cannot bypass the proxy or reach a non-allowlisted host', async () => {
    // The test container has only an internal Docker network. A direct public
    // address must be unreachable, while the proxy must reject any exact host
    // outside its recorded GitHub allowlist.
    await expect(canConnectDirectly('1.1.1.1', 443)).resolves.toBe(false)
    await expect(canResolveExternally('example.com')).resolves.toBe(false)
    await expect(proxyConnectStatus('example.com:443')).resolves.toBe(403)
    await expect(proxyConnectStatus('registry.npmjs.org:443')).resolves.toBe(403)
    await expect(proxyConnectStatus('add-skill.vercel.sh:443')).resolves.toBe(403)
  })

  test('@network routes Git and Node fetch through the allowlisted proxy', async () => {
    await withIsolatedHome(async home => {
      const gitResult = await run('git', [
        'ls-remote',
        '--exit-code',
        'https://github.com/op7418/Humanizer-zh.git',
        'HEAD',
      ], home)
      expect(gitResult.code, `${gitResult.stdout}\n${gitResult.stderr}`).toBe(0)
      expect(gitResult.stdout).toContain('HEAD')

      const fetchResult = await run(process.execPath, [
        '--input-type=module',
        '--eval',
        "const response = await fetch('https://api.github.com/repos/op7418/Humanizer-zh', { headers: { 'user-agent': 'skills-ui-network-test' } }); if (!response.ok) throw new Error(String(response.status));",
      ], home)
      expect(fetchResult.code, `${fetchResult.stdout}\n${fetchResult.stderr}`).toBe(0)
    })
  })

  test('@network installs a single-skill repository from a Git URL', async () => {
    await withIsolatedHome(async home => {
      const result = await run(process.execPath, [CLI_ENTRY, 'add', 'https://github.com/op7418/Humanizer-zh.git'], home)

      expect(result.code, result.stderr).toBe(0)
      expect((await installedSkillNames(home)).sort()).toEqual(['humanizer-zh'])
    })
  })

  test('@network installs an owner/repository shorthand source', async () => {
    await withIsolatedHome(async home => {
      const result = await run(process.execPath, [CLI_ENTRY, 'add', 'op7418/Humanizer-zh'], home)

      expect(result.code, result.stderr).toBe(0)
      expect((await installedSkillNames(home)).sort()).toEqual(['humanizer-zh'])
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
      expect((await installedSkillNames(home)).sort()).toEqual(['skill-creator'])
    })
  })

  test('@network API installation uses the container-only HOME', async ({ request }) => {
    const sessionResponse = await request.post('/api/session', {
      data: {},
      headers: {
        'Content-Type': 'application/json',
        Origin: SERVICE_ORIGIN,
      },
    })
    const sessionBody = await sessionResponse.text()
    expect(sessionResponse.status(), sessionBody).toBe(200)
    const { csrfToken } = JSON.parse(sessionBody) as { csrfToken?: string }
    expect(csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const response = await request.post('/api/skills', {
      data: { source: 'https://github.com/op7418/Humanizer-zh.git' },
      headers: {
        [CSRF_HEADER]: csrfToken!,
        'Content-Type': 'application/json',
        Origin: SERVICE_ORIGIN,
      },
      timeout: NETWORK_TIMEOUT,
    })

    expect(response.status(), await response.text()).toBe(201)
    const skills = await request.get('/api/skills', {
      headers: { [CSRF_HEADER]: csrfToken! },
    })
    expect(skills.status()).toBe(200)
    const body = await skills.json() as Array<{
      name?: string
      instances?: Array<{ path?: string }>
    }>
    expect(body.map(skill => skill.name).sort()).toEqual(['humanizer-zh'])
    const installed = body[0]
    expect(installed.instances?.length).toBeGreaterThan(0)
    for (const instance of installed.instances ?? []) {
      expect(instance.path?.startsWith(`${process.env.HOME}/`)).toBe(true)
    }
  })

  test('@network reports a nonexistent repository without a stack trace', async () => {
    await withIsolatedHome(async home => {
      const result = await run(process.execPath, [CLI_ENTRY, 'add', 'this-org-does-not-exist-9x9x9/nope'], home)

      expect(result.code).toBe(1)
      expect(result.stderr).toContain('Error:')
      expect(result.stderr).not.toContain('    at ')
    })
  })
})
