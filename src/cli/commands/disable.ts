import { Command } from 'commander'
import { createInventoryManager } from '../../core/inventory.js'
import { createProjectRegistry } from '../../core/projects.js'
import { ARCHIVE_DIR, CONFIG_PATH, INVENTORY_PATH } from '../../core/constants.js'
import { buildProjectSkillStatus, getActionAgentsForStatus } from '../../core/status.js'
import { normalizeAgentId } from '../../core/agents.js'

export function disableCommand(): Command {
  return new Command('disable')
    .argument('<name>', 'Skill name')
    .requiredOption('--project <path>', 'Project path')
    .requiredOption('--agent <agent>', 'Agent ID (e.g. claude-code)')
    .description('Disable a skill for a project+agent')
    .action(async (name: string, opts: { project: string; agent: string }) => {
      try {
        const registry = createProjectRegistry(CONFIG_PATH)
        const projects = await registry.listProjects()
        const project = projects.find(project => project.path === opts.project)
        if (!project) {
          throw new Error(`Project not found: ${opts.project}`)
        }
        const manager = createInventoryManager(INVENTORY_PATH, ARCHIVE_DIR)
        const skill = await manager.resolveSkillRef(name, projects)
        if (!skill) {
          throw new Error(`Skill not found: ${name}`)
        }
        const normalizedAgent = normalizeAgentId(opts.agent)
        const status = buildProjectSkillStatus(skill, project)[normalizedAgent]
        if (!status?.canDisable) {
          throw new Error(status?.reason || `Cannot disable ${name} for ${normalizedAgent}`)
        }
        const actionAgents = getActionAgentsForStatus(project, normalizedAgent, status)
        await manager.disableProjectSkill(
          skill.id,
          opts.project,
          actionAgents
        )
        await manager.reconcile(projects)
        console.log(`✓ Disabled ${name} for ${opts.agent} in ${opts.project}`)
      } catch (err: unknown) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })
}
