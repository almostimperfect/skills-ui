// tests/core/state.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, symlink, readlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { existsSync } from 'fs'
import { createStateManager } from '../../src/core/state.js'

let tmpDir: string
let statePath: string
let projectDir: string
let canonicalDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'skills-state-test-'))
  statePath = join(tmpDir, 'state.json')
  projectDir = join(tmpDir, 'my-project')
  canonicalDir = join(projectDir, '.agents', 'skills')
  // Create a mock installed skill
  const skillCanonical = join(canonicalDir, 'tdd-workflow')
  await mkdir(skillCanonical, { recursive: true })
  // Create the agent skills dir
  const agentSkillsDir = join(projectDir, '.claude', 'skills')
  await mkdir(agentSkillsDir, { recursive: true })
  // Create initial symlink (as `skills add` would)
  await symlink(skillCanonical, join(agentSkillsDir, 'tdd-workflow'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true })
})

describe('disable', () => {
  it('removes the symlink from agent dir', async () => {
    const mgr = createStateManager(statePath, projectDir)
    const symlinkPath = join(projectDir, '.claude', 'skills', 'tdd-workflow')
    expect(existsSync(symlinkPath)).toBe(true)
    await mgr.disable(projectDir, 'claude-code', 'tdd-workflow', {
      'claude-code': '.claude/skills',
    })
    expect(existsSync(symlinkPath)).toBe(false)
  })

  it('records disabled state in state.json', async () => {
    const mgr = createStateManager(statePath, projectDir)
    await mgr.disable(projectDir, 'claude-code', 'tdd-workflow', {
      'claude-code': '.claude/skills',
    })
    const isDisabled = await mgr.isDisabled(projectDir, 'claude-code', 'tdd-workflow')
    expect(isDisabled).toBe(true)
  })
})

describe('enable', () => {
  it('recreates the symlink from agent dir to canonical', async () => {
    const mgr = createStateManager(statePath, projectDir)
    const agentDirs = { 'claude-code': '.claude/skills' }
    // First disable
    await mgr.disable(projectDir, 'claude-code', 'tdd-workflow', agentDirs)
    // Then enable
    await mgr.enable(projectDir, 'claude-code', 'tdd-workflow', agentDirs)
    const symlinkPath = join(projectDir, '.claude', 'skills', 'tdd-workflow')
    const target = await readlink(symlinkPath)
    expect(target).toContain('tdd-workflow')
  })

  it('removes disabled entry from state.json', async () => {
    const mgr = createStateManager(statePath, projectDir)
    const agentDirs = { 'claude-code': '.claude/skills' }
    await mgr.disable(projectDir, 'claude-code', 'tdd-workflow', agentDirs)
    await mgr.enable(projectDir, 'claude-code', 'tdd-workflow', agentDirs)
    const isDisabled = await mgr.isDisabled(projectDir, 'claude-code', 'tdd-workflow')
    expect(isDisabled).toBe(false)
  })
})

describe('cleanupSkill', () => {
  it('removes all disabled entries for a given skill name', async () => {
    const mgr = createStateManager(statePath, projectDir)
    const agentDirs = { 'claude-code': '.claude/skills' }
    await mgr.disable(projectDir, 'claude-code', 'tdd-workflow', agentDirs)
    await mgr.cleanupSkill('tdd-workflow')
    const isDisabled = await mgr.isDisabled(projectDir, 'claude-code', 'tdd-workflow')
    expect(isDisabled).toBe(false)
  })
})

describe('cleanupProject', () => {
  it('removes all disabled entries for a given project', async () => {
    const mgr = createStateManager(statePath, projectDir)
    const agentDirs = { 'claude-code': '.claude/skills' }
    await mgr.disable(projectDir, 'claude-code', 'tdd-workflow', agentDirs)
    await mgr.cleanupProject(projectDir)
    const isDisabled = await mgr.isDisabled(projectDir, 'claude-code', 'tdd-workflow')
    expect(isDisabled).toBe(false)
  })
})
