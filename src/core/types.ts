export type AgentId =
  | 'claude-code'
  | 'codex'
  | 'antigravity'
  | 'gemini'
  | string  // allow unknown agents from the future

export interface Skill {
  /** Directory name under .agents/skills/ — canonical unique ID */
  name: string
  /** From SKILL.md frontmatter */
  description: string
  /** Source URL or local path the skill was installed from */
  source: string
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

export interface DisabledState {
  /** key: project absolute path */
  disabled: Record<string, Record<AgentId, string[]>>
}

export interface SkillStatus {
  /** key: agent, value: 'enabled' | 'disabled' */
  [agent: AgentId]: 'enabled' | 'disabled'
}

export interface SkillWithStatus extends Skill {
  /** key: projectPath, value: per-agent status */
  status: Record<string, SkillStatus>
}

export interface ProjectWithMatrix extends Project {
  /** key: skillName, value: per-agent status */
  matrix: Record<string, SkillStatus>
}
