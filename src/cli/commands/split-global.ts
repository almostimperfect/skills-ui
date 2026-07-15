import { Command } from 'commander'
import { createProjectRegistry } from '../../core/projects.js'
import { createInventoryManager } from '../../core/inventory.js'
import { ARCHIVE_DIR, CONFIG_PATH, INVENTORY_PATH } from '../../core/constants.js'

export function splitGlobalCommand(): Command {
  return new Command('split-global')
    .argument('<ref>', 'Skill ID or unique skill name')
    .description('Replace a managed global skill with project-local installs for registered projects')
    .action(async (ref: string) => {
      try {
        const registry = createProjectRegistry(CONFIG_PATH)
        const inventory = createInventoryManager(INVENTORY_PATH, ARCHIVE_DIR)
        const projects = await registry.listProjects()
        const skill = await inventory.resolveSkillRef(ref, projects)
        if (!skill) {
          throw new Error(`Skill not found: ${ref}`)
        }
        await inventory.splitGlobalSkill(skill.id, projects)
        console.log(`✓ Split global skill ${skill.name} into registered projects`)
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })
}
