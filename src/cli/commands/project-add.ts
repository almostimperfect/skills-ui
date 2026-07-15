import { Command } from 'commander'
import { createProjectRegistry } from '../../core/projects.js'
import { createInventoryManager } from '../../core/inventory.js'
import { ARCHIVE_DIR, CONFIG_PATH, INVENTORY_PATH } from '../../core/constants.js'
import { stat } from 'fs/promises'
import { isAbsolute } from 'path'

export function projectAddCommand(): Command {
  return new Command('add')
    .argument('<path>', 'Absolute path to the project')
    .option('--agents <agents>', 'Comma-separated agent IDs to manage')
    .description('Register a project')
    .action(async (rawPath: string, opts: { agents?: string }) => {
      try {
        if (!isAbsolute(rawPath)) throw new Error('Project path must be an absolute path')

        let info
        try {
          info = await stat(rawPath)
        } catch {
          throw new Error(`Project path does not exist: ${rawPath}`)
        }
        if (!info.isDirectory()) throw new Error(`Project path is not a directory: ${rawPath}`)

        const agents = opts.agents ? opts.agents.split(',').map(a => a.trim()) : undefined
        const registry = createProjectRegistry(CONFIG_PATH)
        const project = await registry.registerProject(rawPath, agents)
        const projects = await registry.listProjects()
        await createInventoryManager(INVENTORY_PATH, ARCHIVE_DIR).reconcile(projects)
        console.log(`✓ Registered ${project.name} (${project.path})`)
        console.log(`  Agents: ${project.agents.join(', ') || 'none'}`)
      } catch (err: unknown) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })
}
