import { Command } from 'commander'
import { createProjectRegistry } from '../../core/projects.js'
import { CONFIG_PATH } from '../../core/constants.js'

export function projectsCommand(): Command {
  return new Command('projects')
    .description('List registered projects')
    .action(async () => {
      const projects = await createProjectRegistry(CONFIG_PATH).listProjects()
      if (projects.length === 0) {
        console.log('No projects registered. Use: skills-ui project add <path>')
        return
      }
      for (const p of projects) {
        console.log(`  ${p.name}  (${p.path})  agents: ${p.agents.join(', ')}`)
      }
    })
}
