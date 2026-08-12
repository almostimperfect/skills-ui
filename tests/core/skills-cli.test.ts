// tests/core/skills-cli.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { platform } from 'os'

// Mock child_process before importing the module
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

import { execFile } from 'child_process'
import {
  listInstalledSkills,
  listSkills,
  addSkill,
  removeSkill,
  SkillsCliError,
} from '../../src/core/skills-cli.js'

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>

function mockSuccess(stdout: string, stderr = '') {
  mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: null, stdout: string, stderr: string) => void) => {
    cb(null, stdout, stderr)
  })
}

function mockFailure(code: number, stderr: string) {
  mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: Error) => void) => {
    const err = Object.assign(new Error(stderr), { code })
    cb(err)
  })
}

beforeEach(() => {
  mockExecFile.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const LOCAL_ENV_KEYS = [
  'HOME',
  'PATH',
  'TMPDIR',
  'TMP',
  'TEMP',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_RUNTIME_DIR',
  'XDG_STATE_HOME',
  'CODEX_HOME',
  'CLAUDE_CONFIG_DIR',
  'SystemRoot',
  'WINDIR',
  'ComSpec',
  'PATHEXT',
  'APPDATA',
  'LOCALAPPDATA',
  'USERPROFILE',
] as const

const FIXED_LOCAL_ENV = {
  CI: '1',
  DISABLE_TELEMETRY: '1',
  DO_NOT_TRACK: '1',
  GIT_TERMINAL_PROMPT: '0',
  GIT_ALLOW_PROTOCOL: 'https',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: platform() === 'win32' ? 'NUL' : '/dev/null',
  GIT_CONFIG_COUNT: '4',
  GIT_CONFIG_KEY_0: 'core.hooksPath',
  GIT_CONFIG_VALUE_0: platform() === 'win32' ? 'NUL' : '/dev/null',
  GIT_CONFIG_KEY_1: 'credential.helper',
  GIT_CONFIG_VALUE_1: '',
  GIT_CONFIG_KEY_2: 'protocol.allow',
  GIT_CONFIG_VALUE_2: 'never',
  GIT_CONFIG_KEY_3: 'protocol.https.allow',
  GIT_CONFIG_VALUE_3: 'always',
}

const FORBIDDEN_SENTINELS = [
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GH_ENTERPRISE_TOKEN',
  'GITHUB_ENTERPRISE_TOKEN',
  'GH_CONFIG_DIR',
  'NPM_TOKEN',
  'NODE_AUTH_TOKEN',
  'NPM_CONFIG_USERCONFIG',
  'npm_config_userconfig',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_SHARED_CREDENTIALS_FILE',
  'AZURE_CLIENT_SECRET',
  'AZURE_CONFIG_DIR',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'CLOUDSDK_CONFIG',
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
  'GIT_ASKPASS',
  'SSH_ASKPASS',
  'DOCKER_HOST',
  'DOCKER_CONFIG',
  'KUBECONFIG',
  'HTTP_PROXY',
  'http_proxy',
  'ALL_PROXY',
  'all_proxy',
  'NO_PROXY',
  'HTTPS_PROXY',
  'https_proxy',
  'SKILLS_UI_HTTPS_PROXY',
  'no_proxy',
  'GIT_CONFIG',
  'GIT_CONFIG_SYSTEM',
  'GIT_SSH_COMMAND',
  'UNRELATED_SECRET',
] as const

function stubRepresentativeEnvironment() {
  const required = {
    HOME: '/synthetic/home',
    PATH: '/synthetic/bin',
    TMPDIR: '/synthetic/tmp',
    XDG_CONFIG_HOME: '/synthetic/xdg/config',
    XDG_CACHE_HOME: '/synthetic/xdg/cache',
    XDG_DATA_HOME: '/synthetic/xdg/data',
    XDG_RUNTIME_DIR: '/synthetic/xdg/runtime',
    XDG_STATE_HOME: '/synthetic/xdg/state',
    CODEX_HOME: '/synthetic/codex',
    CLAUDE_CONFIG_DIR: '/synthetic/claude',
  }
  for (const [key, value] of Object.entries(required)) vi.stubEnv(key, value)
  for (const key of FORBIDDEN_SENTINELS) vi.stubEnv(key, `sentinel-${key}`)
  return required
}

function capturedOptions(): { cwd?: string; timeout: number; env: NodeJS.ProcessEnv } {
  return mockExecFile.mock.calls[0][2]
}

function expectedLocalEnvironment(required: Record<string, string>) {
  const inherited = Object.fromEntries(
    LOCAL_ENV_KEYS.flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]]])
  )
  return { ...inherited, ...required, ...FIXED_LOCAL_ENV }
}

describe('listSkills', () => {
  it('returns empty array when no skills installed', async () => {
    mockSuccess('[]\n')
    const skills = await listSkills()
    expect(skills).toEqual([])
  })

  it('parses skill names from JSON output', async () => {
    mockSuccess(JSON.stringify([
      { name: 'tdd-workflow', path: '/tmp/tdd-workflow', scope: 'global', agents: [] },
      { name: 'react-best-practices', path: '/tmp/react-best-practices', scope: 'global', agents: ['Codex'] },
    ]))
    const skills = await listSkills()
    expect(skills.map(s => s.name)).toEqual(['tdd-workflow', 'react-best-practices'])
  })

  it('uses only the explicit local environment and default timeout', async () => {
    const required = stubRepresentativeEnvironment()
    vi.stubEnv('SKILLS_UI_HTTPS_PROXY', 'http://scoped-proxy.invalid:8080')
    mockSuccess('[]')

    await listInstalledSkills({ cwd: '/synthetic/project' })

    const options = capturedOptions()
    expect(options.cwd).toBe('/synthetic/project')
    expect(options.timeout).toBe(30_000)
    expect(options.env).toEqual(expectedLocalEnvironment(required))
    expect(Object.values(options.env)).not.toContain(expect.stringContaining('sentinel-'))
    expect(options.env).not.toHaveProperty('HTTPS_PROXY')
    expect(options.env).not.toHaveProperty('https_proxy')
    expect(options.env).not.toHaveProperty('NODE_USE_ENV_PROXY')
  })
})

describe('addSkill', () => {
  it('resolves on success', async () => {
    mockSuccess('Installed tdd-workflow\n')
    await expect(addSkill('owner/repo')).resolves.toBeUndefined()
  })

  it('throws SkillsCliError on non-zero exit', async () => {
    mockFailure(1, 'Error: repo not found')
    await expect(addSkill('bad/repo')).rejects.toBeInstanceOf(SkillsCliError)
  })

  it('uses the HTTPS proxy only for explicit installs with safe Git config', async () => {
    const required = stubRepresentativeEnvironment()
    vi.stubEnv('SKILLS_UI_HTTPS_PROXY', '  http://proxy.invalid:8080  ')
    mockSuccess('Installed tdd-workflow\n')

    await addSkill('owner/repo', { cwd: '/synthetic/project' })

    const options = capturedOptions()
    expect(options.cwd).toBe('/synthetic/project')
    expect(options.timeout).toBe(120_000)
    expect(options.env).toEqual({
      ...expectedLocalEnvironment(required),
      HTTPS_PROXY: 'http://proxy.invalid:8080',
      https_proxy: 'http://proxy.invalid:8080',
      NODE_USE_ENV_PROXY: '1',
      GIT_CONFIG_COUNT: '5',
      GIT_CONFIG_KEY_4: 'http.proxy',
      GIT_CONFIG_VALUE_4: 'http://proxy.invalid:8080',
    })
    expect(Object.values(options.env)).not.toContain(expect.stringContaining('sentinel-'))
    expect(options.env).not.toHaveProperty('HTTP_PROXY')
    expect(options.env).not.toHaveProperty('ALL_PROXY')
    expect(options.env).not.toHaveProperty('NO_PROXY')
  })

  it('ignores ambient proxies and omits proxy config when no scoped proxy exists', async () => {
    stubRepresentativeEnvironment()
    vi.stubEnv('SKILLS_UI_HTTPS_PROXY', '')
    vi.stubEnv('HTTPS_PROXY', 'http://ambient-secret-proxy.invalid:8080')
    vi.stubEnv('https_proxy', 'http://ambient-lower-secret-proxy.invalid:8080')
    mockSuccess('Installed first\n')
    await addSkill('owner/first')
    expect(capturedOptions().env).not.toHaveProperty('HTTPS_PROXY')
    expect(capturedOptions().env).not.toHaveProperty('https_proxy')
    expect(capturedOptions().env).not.toHaveProperty('NODE_USE_ENV_PROXY')
    expect(capturedOptions().env.GIT_CONFIG_COUNT).toBe('4')
    expect(capturedOptions().env).not.toHaveProperty('GIT_CONFIG_KEY_4')
  })
})

describe('removeSkill', () => {
  it('resolves on success', async () => {
    mockSuccess('Removed tdd-workflow\n')
    await expect(removeSkill('tdd-workflow')).resolves.toBeUndefined()
  })

  it('uses the same minimal local environment without proxy access', async () => {
    const required = stubRepresentativeEnvironment()
    vi.stubEnv('SKILLS_UI_HTTPS_PROXY', 'http://proxy.invalid:8080')
    mockSuccess('Removed tdd-workflow\n')

    await removeSkill('tdd-workflow', { cwd: '/synthetic/project' })

    const options = capturedOptions()
    expect(options.timeout).toBe(30_000)
    expect(options.env).toEqual(expectedLocalEnvironment(required))
    expect(Object.values(options.env)).not.toContain(expect.stringContaining('sentinel-'))
    expect(options.env).not.toHaveProperty('HTTPS_PROXY')
    expect(options.env).not.toHaveProperty('https_proxy')
  })
})
