import { Command } from 'commander'
import { addSkill, SkillsCliError } from '../../core/skills-cli.js'

export function addCommand(): Command {
  return new Command('add')
    .argument('<source>', 'GitHub repo (owner/repo), URL, or local path')
    .description('Install a skill')
    .action(async (source: string) => {
      try {
        console.log(`Installing ${source}...`)
        await addSkill(source)
        console.log(`✓ Installed ${source}`)
      } catch (err) {
        if (err instanceof SkillsCliError) {
          console.error(`Error: ${err.message}`)
          process.exit(1)
        }
        throw err
      }
    })
}
