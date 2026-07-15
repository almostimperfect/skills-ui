import { Command } from 'commander'
import { createProjectRegistry } from '../../core/projects.js'
import { createInventoryManager } from '../../core/inventory.js'
import { ARCHIVE_DIR, CONFIG_PATH, INVENTORY_PATH } from '../../core/constants.js'

export function removeCommand(): Command {
  return new Command('remove')
    .argument('<ref>', 'Skill ID or unique skill name to remove')
    .description('Remove a managed global skill')
    .action(async (ref: string) => {
      try {
        const registry = createProjectRegistry(CONFIG_PATH)
        const inventory = createInventoryManager(INVENTORY_PATH, ARCHIVE_DIR)
        const projects = await registry.listProjects()
        const skill = await inventory.resolveSkillRef(ref, projects)
        if (!skill) {
          throw new Error(`Skill not found: ${ref}`)
        }
        await inventory.removeGlobalSkill(skill.id, projects)
        await inventory.reconcile(projects)
        console.log(`✓ Removed ${skill.name}`)
      } catch (err: unknown) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })
}
