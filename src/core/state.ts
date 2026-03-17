import { symlink, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { readJson, writeJson } from './file-store.js'
import type { DisabledState } from './types.js'
import { CANONICAL_SKILLS_DIR } from './constants.js'

type AgentDirsMap = Record<string, string>

export interface StateManager {
  isDisabled(projectPath: string, agent: string, skillName: string): Promise<boolean>
  disable(projectPath: string, agent: string, skillName: string, agentDirs: AgentDirsMap): Promise<void>
  enable(projectPath: string, agent: string, skillName: string, agentDirs: AgentDirsMap): Promise<void>
  cleanupSkill(skillName: string): Promise<void>
  cleanupProject(projectPath: string): Promise<void>
  getDisabled(projectPath: string): Promise<Record<string, string[]>>
}

export function createStateManager(statePath: string): StateManager {
  async function read(): Promise<DisabledState> {
    return readJson<DisabledState>(statePath, { disabled: {} })
  }

  async function write(state: DisabledState): Promise<void> {
    return writeJson(statePath, state)
  }

  return {
    async isDisabled(projectPath, agent, skillName) {
      const state = await read()
      return state.disabled[projectPath]?.[agent]?.includes(skillName) ?? false
    },

    async disable(projectPath, agent, skillName, agentDirs) {
      // Remove symlink from agent directory
      const agentRelDir = agentDirs[agent]
      if (agentRelDir) {
        const symlinkPath = join(projectPath, agentRelDir, skillName)
        try {
          await unlink(symlinkPath)
        } catch (e: unknown) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
        }
      }
      // Record in state
      const state = await read()
      state.disabled[projectPath] ??= {}
      state.disabled[projectPath][agent] ??= []
      if (!state.disabled[projectPath][agent].includes(skillName)) {
        state.disabled[projectPath][agent].push(skillName)
      }
      await write(state)
    },

    async enable(projectPath, agent, skillName, agentDirs) {
      // Recreate symlink
      const agentRelDir = agentDirs[agent]
      if (agentRelDir) {
        const agentSkillsDir = join(projectPath, agentRelDir)
        await mkdir(agentSkillsDir, { recursive: true })
        const symlinkPath = join(agentSkillsDir, skillName)
        const target = join(projectPath, CANONICAL_SKILLS_DIR, skillName)
        try {
          await symlink(target, symlinkPath)
        } catch (e: unknown) {
          if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
        }
      }
      // Remove from disabled list
      const state = await read()
      if (state.disabled[projectPath]?.[agent]) {
        state.disabled[projectPath][agent] = state.disabled[projectPath][agent].filter(
          n => n !== skillName
        )
        if (state.disabled[projectPath][agent].length === 0) {
          delete state.disabled[projectPath][agent]
        }
        if (Object.keys(state.disabled[projectPath]).length === 0) {
          delete state.disabled[projectPath]
        }
      }
      await write(state)
    },

    async cleanupSkill(skillName) {
      const state = await read()
      for (const projectPath of Object.keys(state.disabled)) {
        for (const agent of Object.keys(state.disabled[projectPath])) {
          state.disabled[projectPath][agent] = state.disabled[projectPath][agent].filter(
            n => n !== skillName
          )
          if (state.disabled[projectPath][agent].length === 0) {
            delete state.disabled[projectPath][agent]
          }
        }
        if (Object.keys(state.disabled[projectPath]).length === 0) {
          delete state.disabled[projectPath]
        }
      }
      await write(state)
    },

    async cleanupProject(projectPath) {
      const state = await read()
      delete state.disabled[projectPath]
      await write(state)
    },

    async getDisabled(projectPath) {
      const state = await read()
      return state.disabled[projectPath] ?? {}
    },
  }
}
