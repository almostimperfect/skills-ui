import { homedir } from 'os'
import { join } from 'path'
import type { AgentId } from './types.js'

export const SKILLS_UI_DIR = join(homedir(), '.skills-ui')
export const CONFIG_PATH = join(SKILLS_UI_DIR, 'config.json')
export const STATE_PATH = join(SKILLS_UI_DIR, 'state.json')

/** Agent ID → directory name inside a project root */
export const AGENT_DIRS: Record<string, string> = {
  'claude-code': '.claude/skills',
  'codex': '.codex/skills',
  'antigravity': '.antigravity/skills',
  'gemini': '.gemini/skills',
}

/** Canonical skills storage relative to project root */
export const CANONICAL_SKILLS_DIR = '.agents/skills'

export const SUPPORTED_AGENTS: AgentId[] = [
  'claude-code',
  'codex',
  'antigravity',
  'gemini',
]

export const DEFAULT_PORT = 3456
