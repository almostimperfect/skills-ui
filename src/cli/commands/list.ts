import { Command } from 'commander'
import { SkillsCliError } from '../../core/skills-cli.js'
import { createProjectRegistry } from '../../core/projects.js'
import { createInventoryManager } from '../../core/inventory.js'
import { buildProjectSkillStatus } from '../../core/status.js'
import { ARCHIVE_DIR, CONFIG_PATH, INVENTORY_PATH } from '../../core/constants.js'
import { getAgentDisplayName } from '../../core/agents.js'

export function listCommand(): Command {
  return new Command('list')
    .option('--project <path>', 'Filter by project path')
    .description('List installed skills')
    .action(async (opts: { project?: string }) => {
      try {
        const registry = createProjectRegistry(CONFIG_PATH)
        const inventory = createInventoryManager(INVENTORY_PATH, ARCHIVE_DIR)
        const projects = await registry.listProjects()
        const skills = await inventory.listSkills(projects)
        if (skills.length === 0) {
          console.log('No skills installed.')
          return
        }
        if (opts.project) {
          const project = await registry.getProject(opts.project)
          if (!project) {
            console.error(`Project not found: ${opts.project}`)
            process.exit(1)
          }
          for (const skill of skills) {
            const row: string[] = [`  ${skill.name}  [${skill.id}]`]
            const status = buildProjectSkillStatus(skill, project)
            for (const agent of project.agents) {
              const agentStatus = status[agent]
              row.push(`${getAgentDisplayName(agent)}: ${agentStatus?.state ?? 'unavailable'}`)
            }
            console.log(row.join('  |  '))
          }
        } else {
          for (const skill of skills) {
            console.log(`  ${skill.name}  [${skill.id}]${skill.description ? '  —  ' + skill.description : ''}`)
          }
        }
      } catch (err) {
        if (err instanceof SkillsCliError) {
          console.error(`Error: ${err.message}`)
          process.exit(1)
        }
        throw err
      }
    })
}
