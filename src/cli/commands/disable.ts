import { Command } from 'commander'
import { createStateManager } from '../../core/state.js'
import { createProjectRegistry } from '../../core/projects.js'
import { STATE_PATH, CONFIG_PATH, AGENT_DIRS, SUPPORTED_AGENTS } from '../../core/constants.js'

export function disableCommand(): Command {
  return new Command('disable')
    .argument('<name>', 'Skill name')
    .requiredOption('--project <path>', 'Project path')
    .requiredOption('--agent <agent>', 'Agent ID (e.g. claude-code)')
    .description('Disable a skill for a project+agent')
    .action(async (name: string, opts: { project: string; agent: string }) => {
      try {
        if (!(SUPPORTED_AGENTS as string[]).includes(opts.agent)) {
          throw new Error(`Agent must be one of: ${SUPPORTED_AGENTS.join(', ')}`)
        }
        const project = await createProjectRegistry(CONFIG_PATH).getProject(opts.project)
        if (!project) throw new Error(`Project not found: ${opts.project}`)
        if (!project.agents.includes(opts.agent)) {
          throw new Error(`Agent ${opts.agent} is not managed by project ${opts.project}`)
        }
        await createStateManager(STATE_PATH).disable(opts.project, opts.agent, name, AGENT_DIRS)
        console.log(`✓ Disabled ${name} for ${opts.agent} in ${opts.project}`)
      } catch (err: unknown) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })
}
