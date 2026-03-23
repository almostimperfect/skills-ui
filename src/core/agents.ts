import { homedir } from 'os'
import { join } from 'path'

export interface ManagedAgent {
  id: string
  aliases: string[]
  displayName: string
  projectDir: string
  globalDirs: string[]
}

const home = homedir()
const codexHome = process.env.CODEX_HOME?.trim() || join(home, '.codex')
const claudeHome = process.env.CLAUDE_CONFIG_DIR?.trim() || join(home, '.claude')

export const MANAGED_AGENTS: ManagedAgent[] = [
  {
    id: 'claude-code',
    aliases: [],
    displayName: 'Claude Code',
    projectDir: '.claude/skills',
    globalDirs: [join(claudeHome, 'skills')],
  },
  {
    id: 'codex',
    aliases: [],
    displayName: 'Codex',
    projectDir: '.agents/skills',
    globalDirs: [join(home, '.agents', 'skills'), join(codexHome, 'skills')],
  },
  {
    id: 'antigravity',
    aliases: [],
    displayName: 'Antigravity',
    projectDir: '.agent/skills',
    globalDirs: [join(home, '.gemini', 'antigravity', 'skills')],
  },
  {
    id: 'gemini-cli',
    aliases: ['gemini'],
    displayName: 'Gemini CLI',
    projectDir: '.agents/skills',
    globalDirs: [join(home, '.agents', 'skills'), join(home, '.gemini', 'skills')],
  },
]

export const SUPPORTED_AGENT_IDS = MANAGED_AGENTS.map(agent => agent.id)

export function normalizeAgentId(agentId: string): string {
  const normalized = agentId.trim().toLowerCase()
  const match = MANAGED_AGENTS.find(
    agent => agent.id === normalized || agent.aliases.includes(normalized)
  )
  return match?.id ?? normalized
}

export function normalizeAgentList(agentIds: string[]): string[] {
  return Array.from(new Set(agentIds.map(normalizeAgentId)))
}

export function getManagedAgent(agentId: string): ManagedAgent | undefined {
  const normalized = normalizeAgentId(agentId)
  return MANAGED_AGENTS.find(agent => agent.id === normalized)
}

export function getAgentDisplayName(agentId: string): string {
  return getManagedAgent(agentId)?.displayName ?? agentId
}

export function agentIdFromDisplayName(displayName: string): string | undefined {
  const normalized = displayName.trim().toLowerCase()
  return MANAGED_AGENTS.find(agent => agent.displayName.toLowerCase() === normalized)?.id
}

export function getProjectGroupAgents(agentIds: string[], agentId: string): string[] {
  const normalized = normalizeAgentId(agentId)
  const agent = getManagedAgent(normalized)
  if (!agent) return [normalized]
  return normalizeAgentList(agentIds).filter(other => getManagedAgent(other)?.projectDir === agent.projectDir)
}

export function isUniversalProjectAgent(agentId: string): boolean {
  return getManagedAgent(agentId)?.projectDir === '.agents/skills'
}

export function inferAgentsFromProjectPath(skillPath: string, projectPath: string): string[] {
  const matches = MANAGED_AGENTS.filter(agent =>
    skillPath === join(projectPath, agent.projectDir) ||
    skillPath.startsWith(join(projectPath, agent.projectDir) + '/')
  ).map(agent => agent.id)
  return normalizeAgentList(matches)
}

export function inferAgentsFromGlobalPath(skillPath: string): string[] {
  const matches = MANAGED_AGENTS.filter(agent =>
    agent.globalDirs.some(globalDir => skillPath === globalDir || skillPath.startsWith(globalDir + '/'))
  ).map(agent => agent.id)
  return normalizeAgentList(matches)
}
