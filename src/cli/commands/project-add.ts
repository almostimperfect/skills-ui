import { Command } from 'commander'
import { createProjectRegistry } from '../../core/projects.js'
import { CONFIG_PATH } from '../../core/constants.js'
import { resolve } from 'path'

export function projectAddCommand(): Command {
  return new Command('add')
    .argument('<path>', 'Absolute or relative path to the project')
    .option('--agents <agents>', 'Comma-separated agent IDs to manage')
    .description('Register a project')
    .action(async (rawPath: string, opts: { agents?: string }) => {
      const projectPath = resolve(rawPath)
      const agents = opts.agents ? opts.agents.split(',').map(a => a.trim()) : undefined
      const project = await createProjectRegistry(CONFIG_PATH).registerProject(projectPath, agents)
      console.log(`✓ Registered ${project.name} (${project.path})`)
      console.log(`  Agents: ${project.agents.join(', ') || 'none'}`)
    })
}
