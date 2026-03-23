import {
  agentIdFromDisplayName,
  getAgentDisplayName,
  getProjectGroupAgents,
  inferAgentsFromGlobalPath,
  inferAgentsFromProjectPath,
  isUniversalProjectAgent,
  normalizeAgentId,
  normalizeAgentList,
} from './agents.js'
import type {
  AgentSkillStatus,
  InventorySkill,
  Project,
  SkillStatus,
} from './types.js'

function formatAgentList(agentIds: string[]): string {
  return agentIds.map(getAgentDisplayName).join(', ')
}

function coveredAgentsForInstance(skill: InventorySkill, project: Project | undefined): string[] {
  const fromDisplayNames = skill.instances.flatMap(instance =>
    instance.agents
      .map(agentIdFromDisplayName)
      .filter((agentId): agentId is string => Boolean(agentId))
  )
  const fromPaths = skill.instances.flatMap(instance => {
    if (instance.scope === 'project' && instance.projectPath && project && instance.projectPath === project.path) {
      return inferAgentsFromProjectPath(instance.path, project.path)
    }
    if (instance.scope === 'global') {
      return inferAgentsFromGlobalPath(instance.path)
    }
    return []
  })
  return normalizeAgentList([...fromDisplayNames, ...fromPaths])
}

function projectVisibleAgents(skill: InventorySkill, project: Project): string[] {
  const visible = new Set<string>()
  for (const instance of skill.instances) {
    if (instance.scope !== 'project' || instance.projectPath !== project.path) continue
    for (const agent of normalizeAgentList([
      ...instance.agents
        .map(agentIdFromDisplayName)
        .filter((agentId): agentId is string => Boolean(agentId)),
      ...inferAgentsFromProjectPath(instance.path, project.path),
    ])) {
      visible.add(agent)
    }
  }
  return Array.from(visible)
}

function globalVisibleAgents(skill: InventorySkill): string[] {
  const visible = new Set<string>()
  for (const instance of skill.instances) {
    if (instance.scope !== 'global') continue
    for (const agent of normalizeAgentList([
      ...instance.agents
        .map(agentIdFromDisplayName)
        .filter((agentId): agentId is string => Boolean(agentId)),
      ...inferAgentsFromGlobalPath(instance.path),
    ])) {
      visible.add(agent)
    }
  }
  return Array.from(visible)
}

function buildAgentStatus(
  skill: InventorySkill,
  project: Project,
  agentId: string,
  projectVisible: Set<string>,
  globalVisible: Set<string>
): AgentSkillStatus {
  const normalizedAgent = normalizeAgentId(agentId)
  const normalizedProjectAgents = normalizeAgentList(project.agents)
  const sharedProjectAgents = getProjectGroupAgents(normalizedProjectAgents, normalizedAgent)
  const visibleSharedProjectAgents = sharedProjectAgents.filter(agent => projectVisible.has(agent))
  const visibleExclusiveProjectAgents = normalizedProjectAgents.filter(
    agent => projectVisible.has(agent) && !isUniversalProjectAgent(agent)
  )

  if (projectVisible.has(normalizedAgent)) {
    if (isUniversalProjectAgent(normalizedAgent)) {
      if (visibleExclusiveProjectAgents.length > 0) {
        return {
          state: 'project',
          canEnable: false,
          canDisable: false,
          reason: `Visible through the shared .agents/skills directory because ${formatAgentList(visibleExclusiveProjectAgents)} is installed in this project.`,
          sharedWith: sharedProjectAgents.filter(agent => agent !== normalizedAgent),
        }
      }
      return {
        state: 'project',
        canEnable: false,
        canDisable: true,
        ...(visibleSharedProjectAgents.length > 1
          ? {
              reason: `Managed as a shared project-local install for ${formatAgentList(visibleSharedProjectAgents)}.`,
              sharedWith: visibleSharedProjectAgents.filter(agent => agent !== normalizedAgent),
            }
          : {}),
      }
    }

    return {
      state: 'project',
      canEnable: false,
      canDisable: true,
    }
  }

  if (globalVisible.has(normalizedAgent)) {
    return {
      state: 'global',
      canEnable: false,
      canDisable: false,
      reason: 'Inherited from a global installation. Disable it globally or migrate it into project-local copies.',
    }
  }

  if (!skill.reinstallable || !skill.reinstallSource) {
    return {
      state: 'unavailable',
      canEnable: false,
      canDisable: false,
      reason: 'No reinstall source is available for this skill.',
    }
  }

  const visibleUniversalProjectAgents = normalizedProjectAgents.filter(
    agent => isUniversalProjectAgent(agent)
  )
  if (isUniversalProjectAgent(normalizedAgent) && visibleUniversalProjectAgents.length > 1) {
    return {
      state: 'available',
      canEnable: true,
      canDisable: false,
      reason: `Enabling installs into the shared .agents/skills directory for ${formatAgentList(visibleUniversalProjectAgents)}.`,
      sharedWith: visibleUniversalProjectAgents.filter(agent => agent !== normalizedAgent),
    }
  }

  if (!isUniversalProjectAgent(normalizedAgent) && visibleUniversalProjectAgents.length > 0) {
    return {
      state: 'available',
      canEnable: true,
      canDisable: false,
      reason: `Project-local installs also create a canonical .agents/skills copy that may be visible to ${formatAgentList(visibleUniversalProjectAgents)}.`,
    }
  }

  return {
    state: 'available',
    canEnable: true,
    canDisable: false,
  }
}

export function buildProjectSkillStatus(skill: InventorySkill, project: Project): SkillStatus {
  const normalizedAgents = normalizeAgentList(project.agents)
  const projectVisible = new Set(projectVisibleAgents(skill, project))
  const globalVisible = new Set(globalVisibleAgents(skill))
  const status: SkillStatus = {}

  for (const agent of normalizedAgents) {
    status[agent] = buildAgentStatus(skill, project, agent, projectVisible, globalVisible)
  }

  return status
}

export function buildSkillStatusMap(skill: InventorySkill, projects: Project[]): Record<string, SkillStatus> {
  return Object.fromEntries(projects.map(project => [project.path, buildProjectSkillStatus(skill, project)]))
}

export function getActionAgentsForStatus(project: Project, agentId: string, status: AgentSkillStatus): string[] {
  const normalizedAgent = normalizeAgentId(agentId)
  if (!status.sharedWith || status.sharedWith.length === 0 || !isUniversalProjectAgent(normalizedAgent)) {
    return [normalizedAgent]
  }

  return getProjectGroupAgents(project.agents, normalizedAgent)
}
