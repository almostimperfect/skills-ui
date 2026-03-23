import { Command } from 'commander'
import { addSkill, SkillsCliError } from '../../core/skills-cli.js'
import { createProjectRegistry } from '../../core/projects.js'
import { createInventoryManager } from '../../core/inventory.js'
import { ARCHIVE_DIR, CONFIG_PATH, INVENTORY_PATH } from '../../core/constants.js'

export function addCommand(): Command {
  return new Command('add')
    .argument('<source>', 'GitHub repo (owner/repo), URL, or local path')
    .description('Install a skill')
    .action(async (source: string) => {
      try {
        console.log(`Installing ${source}...`)
        await addSkill(source, { global: true })
        const projects = await createProjectRegistry(CONFIG_PATH).listProjects()
        await createInventoryManager(INVENTORY_PATH, ARCHIVE_DIR).reconcile(projects)
        console.log(`✓ Installed ${source}`)
      } catch (err) {
        if (err instanceof SkillsCliError) {
          console.error(`Error: ${err.message}`)
          process.exit(1)
        }
        throw err
      }
    })
}
