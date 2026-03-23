export type AgentId =
  | 'claude-code'
  | 'codex'
  | 'antigravity'
  | string  // allow unknown agents from the future

export type InstallScope = 'global' | 'project'

export interface Skill {
  /** Stable catalog ID used by skills-ui even when names collide */
  id: string
  /** Directory name under .agents/skills/ — canonical unique ID */
  name: string
  /** From SKILL.md frontmatter */
  description: string
  /** Source URL or local path the skill was installed from */
  source: string
  /** Whether skills-ui can reinstall this skill from recorded metadata */
  reinstallable?: boolean
}

export interface DiscoveredSkill {
  name: string
  description: string
  path: string
  scope: InstallScope
  agents: string[]
}

export interface SkillInstance {
  scope: InstallScope
  path: string
  agents: string[]
  projectPath?: string
}

export interface InventorySkill extends Skill {
  reinstallSource: string
  sourceType: string
  archivedPath?: string
  instances: SkillInstance[]
}

export interface InventoryState {
  version: number
  skills: Record<string, InventorySkill>
}

export interface Project {
  /** Absolute filesystem path — unique identifier */
  path: string
  /** Display name, defaults to basename of path */
  name: string
  /** Which agents are managed for this project */
  agents: AgentId[]
}

export interface Config {
  projects: Project[]
}

export type SkillState = 'project' | 'global' | 'available' | 'unavailable'

export interface AgentSkillStatus {
  state: SkillState
  canEnable: boolean
  canDisable: boolean
  reason?: string
  sharedWith?: AgentId[]
}

export interface SkillStatus {
  /** key: agent, value: structured availability state */
  [agent: AgentId]: AgentSkillStatus
}

export interface SkillWithStatus extends Skill {
  /** key: projectPath, value: per-agent status */
  status: Record<string, SkillStatus>
}

export interface ProjectSkillRow extends Skill {
  status: SkillStatus
}

export interface ProjectWithMatrix extends Project {
  skills: ProjectSkillRow[]
}

export type SkillUpdateStatus = 'up-to-date' | 'update-available' | 'unsupported' | 'error'

export interface SkillUpdateInfo {
  supported: boolean
  status: SkillUpdateStatus
  reason?: string
  installedAt?: string
  updatedAt?: string
  checkedAt: string
}

export interface SkillDriftInfo {
  projectPath: string
  paths: string[]
}

export interface SkillMaintenanceInfo {
  update: SkillUpdateInfo
  modifiedProjects: SkillDriftInfo[]
}
