import { describe, expect, it } from 'vitest'
import { buildProductOverview } from '../../src/core/overview.js'
import type { InventorySkill, Project, SkillMaintenanceInfo } from '../../src/core/types.js'

describe('product overview', () => {
  it('counts Skills by product state instead of counting installation directories', () => {
    const skills: InventorySkill[] = [
      {
        id: 'global', name: 'global', description: '', source: 'owner/repo', reinstallSource: 'owner/repo',
        reinstallable: true, sourceType: 'github',
        instances: [
          { scope: 'global', path: '/synthetic/global-a', agents: ['Codex'] },
          { scope: 'global', path: '/synthetic/global-b', agents: ['Claude Code'] },
        ],
      },
      {
        id: 'project', name: 'project', description: '', source: 'owner/repo', reinstallSource: 'owner/repo',
        reinstallable: true, sourceType: 'github',
        instances: [
          { scope: 'project', path: '/synthetic/p1', projectPath: '/synthetic/project-one', agents: ['Codex'] },
          { scope: 'project', path: '/synthetic/p2', projectPath: '/synthetic/project-two', agents: ['Codex'] },
        ],
      },
      {
        id: 'catalog', name: 'catalog', description: '', source: '', reinstallSource: '',
        reinstallable: false, sourceType: 'unknown', instances: [],
      },
    ]
    const projects: Project[] = [
      { path: '/synthetic/project-one', name: 'project-one', agents: ['codex'] },
      { path: '/synthetic/missing', name: 'missing', agents: ['codex'] },
    ]
    const maintenance = new Map<string, SkillMaintenanceInfo>([
      ['global', {
        update: { supported: true, status: 'update-available', checkedAt: '2026-07-15T00:00:00.000Z' },
        modifiedProjects: [],
      }],
      ['project', {
        update: { supported: false, status: 'unsupported', checkedAt: '2026-07-15T00:00:00.000Z' },
        modifiedProjects: [{ projectPath: '/synthetic/project-one', paths: ['/synthetic/p1'] }],
      }],
    ])

    const overview = buildProductOverview(
      skills,
      projects,
      maintenance,
      new Set(['/synthetic/missing']),
      '2026-07-15T01:00:00.000Z'
    )

    expect(overview).toMatchObject({
      knownSkills: 3,
      skillsInstalledGlobally: 1,
      skillsInstalledInProjects: 1,
      catalogOnlySkills: 1,
      registeredProjects: 2,
      modifiedProjectCopies: 1,
      updateAvailableSkills: 1,
      sourceMissingSkills: 1,
      missingProjects: [{ path: '/synthetic/missing', name: 'missing' }],
    })
  })
})
