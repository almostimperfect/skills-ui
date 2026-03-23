import { Command } from 'commander'
import { createProjectRegistry } from '../../core/projects.js'
import { createInventoryManager } from '../../core/inventory.js'
import { ARCHIVE_DIR, CONFIG_PATH, INVENTORY_PATH } from '../../core/constants.js'

export function updateCommand(): Command {
  return new Command('update')
    .argument('<ref>', 'Skill ID or unique skill name')
    .description('Update a managed global skill from its recorded source')
    .action(async (ref: string) => {
      try {
        const registry = createProjectRegistry(CONFIG_PATH)
        const inventory = createInventoryManager(INVENTORY_PATH, ARCHIVE_DIR)
        const projects = await registry.listProjects()
        const skill = await inventory.resolveSkillRef(ref, projects)
        if (!skill) {
          throw new Error(`Skill not found: ${ref}`)
        }
        await inventory.updateGlobalSkill(skill.id, projects)
        console.log(`✓ Updated global skill ${skill.name}`)
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })
}
