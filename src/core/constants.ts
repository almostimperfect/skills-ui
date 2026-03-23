import { homedir } from 'os'
import { join } from 'path'
import type { AgentId } from './types.js'
import { SUPPORTED_AGENT_IDS } from './agents.js'

export const SKILLS_UI_DIR = join(homedir(), '.skills-ui')
export const CONFIG_PATH = join(SKILLS_UI_DIR, 'config.json')
export const INVENTORY_PATH = join(SKILLS_UI_DIR, 'inventory.json')
export const ARCHIVE_DIR = join(SKILLS_UI_DIR, 'archive')

/** Agent ID → directory name inside a project root */
export const AGENT_DIRS: Record<string, string> = {
  'claude-code': '.claude/skills',
  'codex': '.agents/skills',
  'antigravity': '.agent/skills',
  'gemini-cli': '.agents/skills',
  'gemini': '.agents/skills',
}

/** Canonical skills storage relative to project root */
export const CANONICAL_SKILLS_DIR = '.agents/skills'

export const SUPPORTED_AGENTS: AgentId[] = [
  ...SUPPORTED_AGENT_IDS,
]

export const DEFAULT_PORT = 3456
