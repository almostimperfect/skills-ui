import { SkillsCliError } from '../core/skills-cli.js'

export interface SafeOperationalError {
  status: number
  message: string
}

export function safeOperationalError(error: unknown, cliStatus = 422): SafeOperationalError {
  if (error instanceof SkillsCliError) {
    return {
      status: cliStatus,
      message: 'The Skill source could not be installed. Check the repository and network connection.',
    }
  }
  return { status: 500, message: 'The operation could not be completed.' }
}
