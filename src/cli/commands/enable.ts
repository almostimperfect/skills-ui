import { Command } from 'commander'
import { createStateManager } from '../../core/state.js'
import { STATE_PATH, AGENT_DIRS } from '../../core/constants.js'

export function enableCommand(): Command {
  return new Command('enable')
    .argument('<name>', 'Skill name')
    .requiredOption('--project <path>', 'Project path')
    .requiredOption('--agent <agent>', 'Agent ID (e.g. claude-code)')
    .description('Enable a skill for a project+agent')
    .action(async (name: string, opts: { project: string; agent: string }) => {
      await createStateManager(STATE_PATH).enable(opts.project, opts.agent, name, AGENT_DIRS)
      console.log(`✓ Enabled ${name} for ${opts.agent} in ${opts.project}`)
    })
}
