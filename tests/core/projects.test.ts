// tests/core/projects.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createProjectRegistry } from '../../src/core/projects.js'

let tmpDir: string
let configPath: string
let projectDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'skills-projects-test-'))
  configPath = join(tmpDir, 'config.json')
  projectDir = join(tmpDir, 'my-project')
  await mkdir(projectDir)
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true })
})

describe('registerProject', () => {
  it('adds a project with auto-derived name from path', async () => {
    const registry = createProjectRegistry(configPath)
    await registry.registerProject(projectDir)
    const projects = await registry.listProjects()
    expect(projects).toHaveLength(1)
    expect(projects[0].path).toBe(projectDir)
    expect(projects[0].name).toBe('my-project')
  })

  it('auto-detects claude-code agent when .claude/ exists', async () => {
    await mkdir(join(projectDir, '.claude', 'skills'), { recursive: true })
    const registry = createProjectRegistry(configPath)
    await registry.registerProject(projectDir)
    const projects = await registry.listProjects()
    expect(projects[0].agents).toContain('claude-code')
  })

  it('does not duplicate already-registered project', async () => {
    const registry = createProjectRegistry(configPath)
    await registry.registerProject(projectDir)
    await registry.registerProject(projectDir)
    const projects = await registry.listProjects()
    expect(projects).toHaveLength(1)
  })

  it('accepts explicit agents override', async () => {
    const registry = createProjectRegistry(configPath)
    await registry.registerProject(projectDir, ['codex', 'gemini'])
    const projects = await registry.listProjects()
    expect(projects[0].agents).toEqual(['codex', 'gemini-cli'])
  })
})

describe('getProject', () => {
  it('returns undefined for unknown path', async () => {
    const registry = createProjectRegistry(configPath)
    const project = await registry.getProject('/does/not/exist')
    expect(project).toBeUndefined()
  })
})

describe('updateProject', () => {
  it('updates name and agents', async () => {
    const registry = createProjectRegistry(configPath)
    await registry.registerProject(projectDir)
    await registry.updateProject(projectDir, { name: 'custom', agents: ['codex'] })
    const project = await registry.getProject(projectDir)
    expect(project?.name).toBe('custom')
    expect(project?.agents).toEqual(['codex'])
  })
})

describe('unregisterProject', () => {
  it('removes the project from the list', async () => {
    const registry = createProjectRegistry(configPath)
    await registry.registerProject(projectDir)
    await registry.unregisterProject(projectDir)
    const projects = await registry.listProjects()
    expect(projects).toHaveLength(0)
  })
})
