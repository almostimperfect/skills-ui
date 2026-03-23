import { describe, it, expect } from 'vitest'
import { buildProjectSkillStatus, getActionAgentsForStatus } from '../../src/core/status.js'
import type { InventorySkill, Project } from '../../src/core/types.js'

describe('buildProjectSkillStatus', () => {
  it('marks universal agents as shared project installs when canonical project skills come from another agent', () => {
    const project: Project = {
      path: '/workspace/app',
      name: 'app',
      agents: ['claude-code', 'codex', 'gemini-cli'],
    }

    const skill: InventorySkill = {
      id: 'frontend-design-1',
      name: 'frontend-design',
      description: '',
      source: 'owner/repo',
      reinstallSource: 'owner/repo',
      reinstallable: true,
      sourceType: 'github',
      instances: [
        {
          scope: 'project',
          projectPath: project.path,
          path: '/workspace/app/.agents/skills/frontend-design',
          agents: ['Claude Code'],
        },
      ],
    }

    const status = buildProjectSkillStatus(skill, project)

    expect(status['claude-code'].state).toBe('project')
    expect(status['claude-code'].canDisable).toBe(true)
    expect(status['codex'].state).toBe('project')
    expect(status['codex'].canDisable).toBe(false)
    expect(status['codex'].reason).toContain('shared .agents/skills')
    expect(status['gemini-cli'].state).toBe('project')
    expect(status['gemini-cli'].canDisable).toBe(false)
  })

  it('marks global-only visibility as inherited and not per-project disableable', () => {
    const project: Project = {
      path: '/workspace/app',
      name: 'app',
      agents: ['claude-code', 'codex'],
    }

    const skill: InventorySkill = {
      id: 'review-1',
      name: 'review',
      description: '',
      source: 'owner/repo',
      reinstallSource: 'owner/repo',
      reinstallable: true,
      sourceType: 'github',
      instances: [
        {
          scope: 'global',
          path: '/workspace/.claude/skills/review',
          agents: ['Claude Code'],
        },
      ],
    }

    const status = buildProjectSkillStatus(skill, project)
    expect(status['claude-code'].state).toBe('global')
    expect(status['claude-code'].canDisable).toBe(false)
    expect(status['codex'].state).toBe('available')
    expect(status['codex'].canEnable).toBe(true)
  })

  it('groups universal project actions when enabling a shared .agents/skills install', () => {
    const project: Project = {
      path: '/workspace/app',
      name: 'app',
      agents: ['codex', 'gemini-cli'],
    }

    const skill: InventorySkill = {
      id: 'shared-skill-1',
      name: 'shared-skill',
      description: '',
      source: '/archive/shared-skill',
      reinstallSource: '/archive/shared-skill',
      reinstallable: true,
      sourceType: 'archive',
      instances: [],
    }

    const status = buildProjectSkillStatus(skill, project)
    expect(status['codex'].state).toBe('available')
    expect(status['codex'].canEnable).toBe(true)
    expect(status['codex'].sharedWith).toEqual(['gemini-cli'])
    expect(getActionAgentsForStatus(project, 'codex', status['codex'])).toEqual(['codex', 'gemini-cli'])
  })
})
