import { Command } from 'commander'
import { removeSkill, SkillsCliError } from '../../core/skills-cli.js'
import { createStateManager } from '../../core/state.js'
import { STATE_PATH, CANONICAL_SKILLS_DIR } from '../../core/constants.js'
import { access } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

export function removeCommand(): Command {
  return new Command('remove')
    .argument('<name>', 'Skill name to remove')
    .description('Uninstall a skill')
    .action(async (name: string) => {
      try {
        try {
          await access(join(homedir(), CANONICAL_SKILLS_DIR, name))
        } catch {
          throw new Error(`Skill not installed: ${name}`)
        }
        await removeSkill(name)
        await createStateManager(STATE_PATH).cleanupSkill(name)
        console.log(`✓ Removed ${name}`)
      } catch (err: unknown) {
        const message = err instanceof SkillsCliError || err instanceof Error
          ? err.message
          : String(err)
        console.error(`Error: ${message}`)
        process.exit(1)
      }
    })
}
