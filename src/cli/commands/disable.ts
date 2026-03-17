import { Command } from 'commander'
import { createStateManager } from '../../core/state.js'
import { STATE_PATH, AGENT_DIRS } from '../../core/constants.js'

export function disableCommand(): Command {
  return new Command('disable')
    .argument('<name>', 'Skill name')
    .requiredOption('--project <path>', 'Project path')
    .requiredOption('--agent <agent>', 'Agent ID (e.g. claude-code)')
    .description('Disable a skill for a project+agent')
    .action(async (name: string, opts: { project: string; agent: string }) => {
      try {
        await createStateManager(STATE_PATH).disable(opts.project, opts.agent, name, AGENT_DIRS)
        console.log(`✓ Disabled ${name} for ${opts.agent} in ${opts.project}`)
      } catch (err: unknown) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })
}
