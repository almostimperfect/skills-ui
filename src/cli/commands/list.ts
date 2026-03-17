import { Command } from 'commander'
import { listSkills, SkillsCliError } from '../../core/skills-cli.js'
import { createStateManager } from '../../core/state.js'
import { createProjectRegistry } from '../../core/projects.js'
import { STATE_PATH, CONFIG_PATH } from '../../core/constants.js'

export function listCommand(): Command {
  return new Command('list')
    .option('--project <path>', 'Filter by project path')
    .description('List installed skills')
    .action(async (opts: { project?: string }) => {
      try {
        const skills = await listSkills()
        if (skills.length === 0) {
          console.log('No skills installed.')
          return
        }
        if (opts.project) {
          const project = await createProjectRegistry(CONFIG_PATH).getProject(opts.project)
          if (!project) {
            console.error(`Project not found: ${opts.project}`)
            process.exit(1)
          }
          const state = createStateManager(STATE_PATH)
          for (const skill of skills) {
            const row: string[] = [`  ${skill.name}`]
            for (const agent of project.agents) {
              const disabled = await state.isDisabled(opts.project, agent, skill.name)
              row.push(`${agent}: ${disabled ? 'disabled' : 'enabled'}`)
            }
            console.log(row.join('  |  '))
          }
        } else {
          for (const skill of skills) {
            console.log(`  ${skill.name}${skill.description ? '  —  ' + skill.description : ''}`)
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
