#!/usr/bin/env node
import { Command } from 'commander'
import { addCommand } from './commands/add.js'
import { removeCommand } from './commands/remove.js'
import { listCommand } from './commands/list.js'
import { enableCommand } from './commands/enable.js'
import { disableCommand } from './commands/disable.js'
import { projectsCommand } from './commands/projects.js'
import { projectAddCommand } from './commands/project-add.js'
import { serveCommand } from './commands/serve.js'

const program = new Command()
  .name('skills-ui')
  .description('Visual management layer for agent skills')
  .version('0.1.0')

program.addCommand(addCommand())
program.addCommand(removeCommand())
program.addCommand(listCommand())
program.addCommand(enableCommand())
program.addCommand(disableCommand())
program.addCommand(projectsCommand())

// `skills-ui project add <path>` sub-command
const projectCmd = new Command('project').description('Manage registered projects')
projectCmd.addCommand(projectAddCommand())
program.addCommand(projectCmd)

program.addCommand(serveCommand())

program.parse()
