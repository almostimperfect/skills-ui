import { execFile } from 'child_process'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import type { Skill } from './types.js'

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

async function runSkills(args: string[], timeout = DEFAULT_TIMEOUT): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(SKILLS_BIN, args, { timeout, env: { ...process.env } }, (err, stdout, stderr) => {
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

// The skills CLI hardcodes ANSI colors even when piped (NO_COLOR is ignored).
const ANSI_RE = /\u001b\[[0-9;?]*[A-Za-z]/g

export async function listSkills(): Promise<Skill[]> {
  // -g = global skills store (~/.agents/skills/)
  const stdout = await runSkills(['list', '-g'])
  const skills: Skill[] = []
  for (const raw of stdout.split('\n')) {
    const line = raw.replace(ANSI_RE, '').trim()
    if (line.length === 0) continue
    // Decoration and empty-store lines from skills >=1.4.x, plus the legacy empty message
    if (/^global skills$/i.test(line)) continue
    if (line.startsWith('Agents:')) continue
    if (/^no (global )?skills/i.test(line)) continue // "No global skills found." / "No skills installed."
    if (line.startsWith('Try listing')) continue
    // skills >=1.4.x format: "<name> ~/.agents/skills/<name>" — split on the path suffix
    // so names containing spaces survive. Legacy format (plain name per line) has no
    // suffix and falls through to the whole line.
    const name = line.split(/\s+~\//)[0].trim()
    if (name) skills.push({ name, description: '', source: '' })
  }
  return skills
}

export async function addSkill(source: string): Promise<void> {
  // -g installs to global ~/.agents/skills/, -y skips prompts
  await runSkills(['add', source, '-g', '-y'], ADD_TIMEOUT)
}

export async function removeSkill(name: string): Promise<void> {
  await runSkills(['remove', name, '-g', '-y'])
}
