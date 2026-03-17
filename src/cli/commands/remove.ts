import { Command } from 'commander'
import { removeSkill, SkillsCliError } from '../../core/skills-cli.js'
import { createStateManager } from '../../core/state.js'
import { STATE_PATH } from '../../core/constants.js'

export function removeCommand(): Command {
  return new Command('remove')
    .argument('<name>', 'Skill name to remove')
    .description('Uninstall a skill')
    .action(async (name: string) => {
      try {
        await removeSkill(name)
        await createStateManager(STATE_PATH).cleanupSkill(name)
        console.log(`✓ Removed ${name}`)
      } catch (err) {
        if (err instanceof SkillsCliError) {
          console.error(`Error: ${err.message}`)
          process.exit(1)
        }
        throw err
      }
    })
}
