import { Command } from 'commander'
import { createProjectRegistry } from '../../core/projects.js'
import { createInventoryManager } from '../../core/inventory.js'
import { getSkillMaintenance } from '../../core/maintenance.js'
import { ARCHIVE_DIR, CONFIG_PATH, INVENTORY_PATH } from '../../core/constants.js'

function formatMaintenance(refLabel: string, maintenance: Awaited<ReturnType<typeof getSkillMaintenance>>): string[] {
  const lines = [`${refLabel}`]
  const update = maintenance.update
  lines.push(`  update: ${update.status}${update.reason ? ` (${update.reason})` : ''}`)
  if (update.updatedAt) {
    lines.push(`  last-updated: ${update.updatedAt}`)
  }
  if (maintenance.modifiedProjects.length > 0) {
    lines.push(`  modified-projects: ${maintenance.modifiedProjects.map(project => project.projectPath).join(', ')}`)
  }
  return lines
}

export function checkCommand(): Command {
  return new Command('check')
    .argument('[ref]', 'Skill ID or unique skill name')
    .description('Check maintenance status for managed skills')
    .action(async (ref?: string) => {
      try {
        const registry = createProjectRegistry(CONFIG_PATH)
        const inventory = createInventoryManager(INVENTORY_PATH, ARCHIVE_DIR)
        const projects = await registry.listProjects()
        const skills = ref
          ? (() => inventory.resolveSkillRef(ref, projects).then(skill => skill ? [skill] : []))()
          : inventory.listSkills(projects)

        const resolvedSkills = await skills
        if (resolvedSkills.length === 0) {
          console.log(ref ? `Skill not found: ${ref}` : 'No managed skills found.')
          if (ref) process.exit(1)
          return
        }

        for (const skill of resolvedSkills) {
          const maintenance = await getSkillMaintenance(skill, projects)
          for (const line of formatMaintenance(`${skill.name}  [${skill.id}]`, maintenance)) {
            console.log(line)
          }
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })
}
