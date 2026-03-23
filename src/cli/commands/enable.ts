import { Command } from 'commander'
import { createInventoryManager } from '../../core/inventory.js'
import { ARCHIVE_DIR, CONFIG_PATH, INVENTORY_PATH } from '../../core/constants.js'
import { createProjectRegistry } from '../../core/projects.js'
import { buildProjectSkillStatus, getActionAgentsForStatus } from '../../core/status.js'
import { normalizeAgentId } from '../../core/agents.js'

export function enableCommand(): Command {
  return new Command('enable')
    .argument('<name>', 'Skill name')
    .requiredOption('--project <path>', 'Project path')
    .requiredOption('--agent <agent>', 'Agent ID (e.g. claude-code)')
    .description('Enable a skill for a project+agent')
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
        if (!status?.canEnable) {
          throw new Error(status?.reason || `Cannot enable ${name} for ${normalizedAgent}`)
        }
        const actionAgents = getActionAgentsForStatus(project, normalizedAgent, status)
        await manager.enableProjectSkill(
          skill.id,
          opts.project,
          actionAgents,
          projects
        )
        console.log(`✓ Enabled ${name} for ${opts.agent} in ${opts.project}`)
      } catch (err: unknown) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
    })
}
