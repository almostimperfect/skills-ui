import type { InventorySkill, ProductOverview, Project, SkillMaintenanceInfo } from './types.js'

export function buildProductOverview(
  skills: InventorySkill[],
  projects: Project[],
  maintenance: ReadonlyMap<string, SkillMaintenanceInfo>,
  missingProjectPaths: ReadonlySet<string>,
  generatedAt = new Date().toISOString()
): ProductOverview {
  return {
    generatedAt,
    knownSkills: skills.length,
    skillsInstalledGlobally: skills.filter(skill =>
      skill.instances.some(instance => instance.scope === 'global')
    ).length,
    skillsInstalledInProjects: skills.filter(skill =>
      skill.instances.some(instance => instance.scope === 'project')
    ).length,
    catalogOnlySkills: skills.filter(skill => skill.instances.length === 0).length,
    registeredProjects: projects.length,
    modifiedProjectCopies: Array.from(maintenance.values())
      .reduce((total, info) => total + info.modifiedProjects.length, 0),
    updateAvailableSkills: Array.from(maintenance.values())
      .filter(info => info.update.status === 'update-available').length,
    sourceMissingSkills: skills.filter(skill => !skill.reinstallable || !skill.reinstallSource).length,
    missingProjects: projects
      .filter(project => missingProjectPaths.has(project.path))
      .map(project => ({ path: project.path, name: project.name })),
  }
}
