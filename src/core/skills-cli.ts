import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import { platform } from 'os'
import type { DiscoveredSkill, Skill } from './types.js'

const DEFAULT_TIMEOUT = 30_000
const ADD_TIMEOUT = 120_000

// Resolve the bundled entrypoint directly and execute it with this process's
// Node binary. This avoids npx, shell lookup, and the .bin env-node wrapper.
const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILLS_ENTRY = resolveSkillsEntry(__dirname)

function resolveSkillsEntry(startDir: string): string {
  let current = startDir
  while (true) {
    const candidate = join(current, 'node_modules', 'skills', 'bin', 'cli.mjs')
    if (existsSync(candidate)) return candidate

    const parent = dirname(current)
    if (parent === current) {
      return join(startDir, '..', '..', 'node_modules', 'skills', 'bin', 'cli.mjs')
    }
    current = parent
  }
}

export class SkillsCliError extends Error {
  constructor(
    message: string,
    public readonly exitCode?: number,
    public readonly stderr?: string
  ) {
    super(message)
    this.name = 'SkillsCliError'
  }
}

interface RunSkillsOptions {
  cwd?: string
  timeout?: number
  operation?: 'local' | 'network'
}

interface ListSkillsOptions {
  cwd?: string
  global?: boolean
}

interface AddSkillOptions {
  cwd?: string
  global?: boolean
  skillNames?: string[]
  agents?: string[]
}

interface RemoveSkillOptions {
  cwd?: string
  global?: boolean
  agents?: string[]
}

interface SkillsJsonEntry {
  name: string
  path: string
  scope: 'global' | 'project'
  agents: string[]
}

// The bundled CLI needs these locations to find the user's configured Agent
// homes and platform runtime, but it must not receive the rest of the server's
// ambient environment. In particular, credentials, npm settings, SSH agents,
// Docker access, and arbitrary Git configuration stay out of every child.
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
  // Windows process startup and per-user data locations.
  'SystemRoot',
  'WINDIR',
  'ComSpec',
  'PATHEXT',
  'APPDATA',
  'LOCALAPPDATA',
  'USERPROFILE',
] as const

function buildSkillsEnv(operation: 'local' | 'network'): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of LOCAL_ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }

  const nullDevice = platform() === 'win32' ? 'NUL' : '/dev/null'
  const gitConfig: Array<[string, string]> = [
    ['core.hooksPath', nullDevice],
    ['credential.helper', ''],
    ['protocol.allow', 'never'],
    ['protocol.https.allow', 'always'],
  ]

  if (operation === 'network') {
    // An explicit install may use the skills-ui-specific HTTPS proxy. Generic
    // ambient proxy variables can contain unrelated credentials and stay out.
    const httpsProxy = process.env.SKILLS_UI_HTTPS_PROXY?.trim()
    if (httpsProxy) {
      env.HTTPS_PROXY = httpsProxy
      env.https_proxy = httpsProxy
      env.NODE_USE_ENV_PROXY = '1'
      gitConfig.push(['http.proxy', httpsProxy])
    }
  }

  env.CI = '1'
  env.DISABLE_TELEMETRY = '1'
  env.DO_NOT_TRACK = '1'
  env.GIT_TERMINAL_PROMPT = '0'
  env.GIT_ALLOW_PROTOCOL = 'https'
  env.GIT_CONFIG_NOSYSTEM = '1'
  env.GIT_CONFIG_GLOBAL = nullDevice
  env.GIT_CONFIG_COUNT = String(gitConfig.length)
  gitConfig.forEach(([key, value], index) => {
    env[`GIT_CONFIG_KEY_${index}`] = key
    env[`GIT_CONFIG_VALUE_${index}`] = value
  })

  return env
}

async function runSkills(args: string[], options: RunSkillsOptions = {}): Promise<string> {
  const { cwd, timeout = DEFAULT_TIMEOUT, operation = 'local' } = options
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [SKILLS_ENTRY, ...args], {
      cwd,
      timeout,
      env: buildSkillsEnv(operation),
    }, (err, stdout, stderr) => {
      if (err) {
        const e = err as NodeJS.ErrnoException & { code?: number; stderr?: string }
        if (e.code === 'ENOENT' || String(e.message).includes('not found')) {
          return reject(new SkillsCliError(
            'skills CLI not found. Try running: npm install',
            undefined,
            typeof stderr === 'string' ? stderr : e.stderr
          ))
        }
        return reject(new SkillsCliError(
          (typeof stderr === 'string' ? stderr.trim() : e.stderr?.trim()) || e.message,
          typeof e.code === 'number' ? e.code : undefined,
          typeof stderr === 'string' ? stderr : e.stderr
        ))
      }
      resolve(stdout)
    })
  })
}

export async function listInstalledSkills(options: ListSkillsOptions = {}): Promise<DiscoveredSkill[]> {
  const args = ['list', '--json']
  if (options.global) args.splice(1, 0, '-g')
  const stdout = await runSkills(args, { cwd: options.cwd })

  let parsed: SkillsJsonEntry[]
  try {
    parsed = JSON.parse(stdout) as SkillsJsonEntry[]
  } catch (err) {
    throw new SkillsCliError(
      `Failed to parse skills JSON output: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  return parsed.map(skill => ({
    name: skill.name,
    description: '',
    path: skill.path,
    scope: skill.scope,
    agents: Array.isArray(skill.agents) ? skill.agents : [],
  }))
}

export async function listSkills(): Promise<Skill[]> {
  const skills = await listInstalledSkills({ global: true })
  return skills.map(skill => ({ id: skill.name, name: skill.name, description: '', source: '' }))
}

export async function addSkill(source: string, options: AddSkillOptions = {}): Promise<void> {
  const args = ['add', source, '-y']
  if (options.global) args.push('-g')
  for (const skillName of options.skillNames ?? []) {
    args.push('--skill', skillName)
  }
  for (const agent of options.agents ?? []) {
    args.push('--agent', agent)
  }
  await runSkills(args, { cwd: options.cwd, timeout: ADD_TIMEOUT, operation: 'network' })
}

export async function removeSkill(name: string, options: RemoveSkillOptions = {}): Promise<void> {
  const args = ['remove', name, '-y']
  if (options.global) args.push('-g')
  for (const agent of options.agents ?? []) {
    args.push('--agent', agent)
  }
  await runSkills(args, { cwd: options.cwd })
}
