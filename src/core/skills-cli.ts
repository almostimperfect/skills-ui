import { execFile } from 'child_process'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import type { DiscoveredSkill, Skill } from './types.js'

const DEFAULT_TIMEOUT = 30_000
const ADD_TIMEOUT = 120_000

// Resolve path to the bundled `skills` binary from node_modules to avoid
// picking up a different version that may be on PATH via `npx`.
const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILLS_BIN = join(__dirname, '..', '..', 'node_modules', '.bin', 'skills')

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

async function runSkills(args: string[], options: RunSkillsOptions = {}): Promise<string> {
  const { cwd, timeout = DEFAULT_TIMEOUT } = options
  return new Promise((resolve, reject) => {
    execFile(SKILLS_BIN, args, { cwd, timeout, env: { ...process.env } }, (err, stdout, stderr) => {
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
  await runSkills(args, { cwd: options.cwd, timeout: ADD_TIMEOUT })
}

export async function removeSkill(name: string, options: RemoveSkillOptions = {}): Promise<void> {
  const args = ['remove', name, '-y']
  if (options.global) args.push('-g')
  for (const agent of options.agents ?? []) {
    args.push('--agent', agent)
  }
  await runSkills(args, { cwd: options.cwd })
}
