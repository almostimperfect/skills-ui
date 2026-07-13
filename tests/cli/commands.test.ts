// tests/cli/commands.test.ts — unit tests for every CLI command action.
// Core modules are mocked (same pattern as tests/server/*); commander actions are
// driven via cmd.parseAsync(args, { from: 'user' }).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockState = {
  isDisabled: vi.fn().mockResolvedValue(false),
  enable: vi.fn().mockResolvedValue(undefined),
  disable: vi.fn().mockResolvedValue(undefined),
  cleanupSkill: vi.fn().mockResolvedValue(undefined),
  cleanupProject: vi.fn().mockResolvedValue(undefined),
  getDisabled: vi.fn().mockResolvedValue({}),
}
const mockRegistry = {
  listProjects: vi.fn().mockResolvedValue([]),
  getProject: vi.fn().mockResolvedValue(undefined),
  registerProject: vi.fn(),
  updateProject: vi.fn(),
  unregisterProject: vi.fn(),
}

vi.mock('../../src/core/skills-cli.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/core/skills-cli.js')>()
  return {
    SkillsCliError: actual.SkillsCliError,
    listSkills: vi.fn(),
    addSkill: vi.fn(),
    removeSkill: vi.fn(),
  }
})
vi.mock('../../src/core/state.js', () => ({ createStateManager: vi.fn(() => mockState) }))
vi.mock('../../src/core/projects.js', () => ({ createProjectRegistry: vi.fn(() => mockRegistry) }))
vi.mock('../../src/core/metadata.js', () => ({ parseSkillMetadata: vi.fn() }))
vi.mock('fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    access: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
  }
})

import { listSkills, addSkill, removeSkill, SkillsCliError } from '../../src/core/skills-cli.js'
import { parseSkillMetadata } from '../../src/core/metadata.js'
import { addCommand } from '../../src/cli/commands/add.js'
import { removeCommand } from '../../src/cli/commands/remove.js'
import { listCommand } from '../../src/cli/commands/list.js'
import { enableCommand } from '../../src/cli/commands/enable.js'
import { disableCommand } from '../../src/cli/commands/disable.js'
import { projectsCommand } from '../../src/cli/commands/projects.js'
import { projectAddCommand } from '../../src/cli/commands/project-add.js'
import { serveCommand } from '../../src/cli/commands/serve.js'
import { access, stat } from 'fs/promises'

const mockList = listSkills as ReturnType<typeof vi.fn>
const mockAdd = addSkill as ReturnType<typeof vi.fn>
const mockRemove = removeSkill as ReturnType<typeof vi.fn>
const mockMeta = parseSkillMetadata as ReturnType<typeof vi.fn>
const mockAccess = access as ReturnType<typeof vi.fn>
const mockStat = stat as ReturnType<typeof vi.fn>

class ExitError extends Error {
  constructor(public code: number | undefined) {
    super(`exit ${code}`)
  }
}

let logs: string[]
let errs: string[]

beforeEach(() => {
  vi.clearAllMocks()
  mockState.isDisabled.mockResolvedValue(false)
  mockState.enable.mockResolvedValue(undefined)
  mockState.disable.mockResolvedValue(undefined)
  mockState.cleanupSkill.mockResolvedValue(undefined)
  mockRegistry.listProjects.mockResolvedValue([])
  mockRegistry.getProject.mockResolvedValue({ path: '/p', name: 'p', agents: ['claude-code'] })
  mockRegistry.registerProject.mockResolvedValue({
    path: '/registered',
    name: 'registered',
    agents: [],
  })
  mockAccess.mockReset()
  mockAccess.mockResolvedValue(undefined)
  mockStat.mockReset()
  mockStat.mockResolvedValue({ isDirectory: () => true })
  mockMeta.mockImplementation(async (_dir: string, name: string) => ({ name, description: '', source: '' }))
  logs = []
  errs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errs.push(a.join(' ')))
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ExitError(code)
  }) as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('add', () => {
  it('installs and prints progress + success', async () => {
    mockAdd.mockResolvedValue(undefined)
    await addCommand().parseAsync(['owner/repo'], { from: 'user' })
    expect(mockAdd).toHaveBeenCalledWith('owner/repo')
    expect(logs.join('\n')).toContain('Installing owner/repo')
    expect(logs.join('\n')).toContain('✓ Installed owner/repo')
  })

  it('prints Error and exits 1 on SkillsCliError', async () => {
    mockAdd.mockRejectedValue(new SkillsCliError('repo not found', 1))
    await expect(addCommand().parseAsync(['bad/repo'], { from: 'user' })).rejects.toThrow(ExitError)
    expect(errs.join('\n')).toContain('Error: repo not found')
  })
})

describe('remove', () => {
  it('removes, cleans up state, and confirms', async () => {
    mockRemove.mockResolvedValue(undefined)
    await removeCommand().parseAsync(['tdd-workflow'], { from: 'user' })
    expect(mockRemove).toHaveBeenCalledWith('tdd-workflow')
    expect(mockState.cleanupSkill).toHaveBeenCalledWith('tdd-workflow')
    expect(logs.join('\n')).toContain('✓ Removed tdd-workflow')
  })

  it('exits 1 with Error message on SkillsCliError', async () => {
    mockRemove.mockRejectedValue(new SkillsCliError('nope', 1))
    await expect(removeCommand().parseAsync(['ghost'], { from: 'user' })).rejects.toThrow(ExitError)
    expect(errs.join('\n')).toContain('Error: nope')
    expect(mockState.cleanupSkill).not.toHaveBeenCalled()
  })

  it('UX-011: exits 1 without calling the bundled CLI when the skill is not installed', async () => {
    mockAccess.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
    await expect(removeCommand().parseAsync(['ghost'], { from: 'user' })).rejects.toThrow(ExitError)
    expect(errs.join('\n')).toContain('Skill not installed: ghost')
    expect(mockRemove).not.toHaveBeenCalled()
    expect(mockState.cleanupSkill).not.toHaveBeenCalled()
  })
})

describe('list', () => {
  it('prints the empty message when no skills are installed', async () => {
    mockList.mockResolvedValue([])
    await listCommand().parseAsync([], { from: 'user' })
    expect(logs.join('\n')).toContain('No skills installed.')
  })

  it('enriches names with descriptions from SKILL.md', async () => {
    mockList.mockResolvedValue([{ name: 'tdd-workflow', description: '', source: '' }])
    mockMeta.mockResolvedValue({ name: 'tdd-workflow', description: 'Red, green, refactor', source: '' })
    await listCommand().parseAsync([], { from: 'user' })
    expect(logs.join('\n')).toContain('tdd-workflow  —  Red, green, refactor')
  })

  it('--project with an unregistered path exits 1', async () => {
    mockList.mockResolvedValue([{ name: 'x', description: '', source: '' }])
    mockRegistry.getProject.mockResolvedValue(undefined)
    await expect(
      listCommand().parseAsync(['--project', '/nope'], { from: 'user' })
    ).rejects.toThrow(ExitError)
    expect(errs.join('\n')).toContain('Project not found: /nope')
  })

  it('--project prints per-agent enabled/disabled status', async () => {
    mockList.mockResolvedValue([{ name: 'tdd-workflow', description: '', source: '' }])
    mockRegistry.getProject.mockResolvedValue({ path: '/p', name: 'p', agents: ['claude-code', 'codex'] })
    mockState.isDisabled.mockImplementation(async (_p: string, agent: string) => agent === 'codex')
    await listCommand().parseAsync(['--project', '/p'], { from: 'user' })
    const out = logs.join('\n')
    expect(out).toContain('claude-code: enabled')
    expect(out).toContain('codex: disabled')
  })
})

describe.each([
  ['enable', enableCommand, () => mockState.enable] as const,
  ['disable', disableCommand, () => mockState.disable] as const,
])('%s', (name, factory, getMock) => {
  it(`calls state.${name} and confirms`, async () => {
    await factory().parseAsync(['skill-x', '--project', '/p', '--agent', 'claude-code'], { from: 'user' })
    expect(getMock()).toHaveBeenCalledWith('/p', 'claude-code', 'skill-x', expect.any(Object))
    const verb = name === 'enable' ? 'Enabled' : 'Disabled'
    expect(logs.join('\n')).toContain(`✓ ${verb} skill-x for claude-code in /p`)
  })

  it('exits 1 with the error message when the state manager throws', async () => {
    ;(getMock() as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'))
    await expect(
      factory().parseAsync(['skill-x', '--project', '/p', '--agent', 'claude-code'], { from: 'user' })
    ).rejects.toThrow(ExitError)
    expect(errs.join('\n')).toContain('Error: boom')
  })

  it('DEBT-001: rejects an unregistered project before mutating state', async () => {
    mockRegistry.getProject.mockResolvedValueOnce(undefined)
    await expect(
      factory().parseAsync(['skill-x', '--project', '/missing', '--agent', 'claude-code'], { from: 'user' })
    ).rejects.toThrow(ExitError)
    expect(errs.join('\n')).toContain('Project not found: /missing')
    expect(getMock()).not.toHaveBeenCalled()
  })

  it('DEBT-001: rejects an agent not managed by the project', async () => {
    await expect(
      factory().parseAsync(['skill-x', '--project', '/p', '--agent', 'codex'], { from: 'user' })
    ).rejects.toThrow(ExitError)
    expect(errs.join('\n')).toContain('not managed by project')
    expect(getMock()).not.toHaveBeenCalled()
  })
})

describe('projects', () => {
  it('prints an actionable empty message', async () => {
    mockRegistry.listProjects.mockResolvedValue([])
    await projectsCommand().parseAsync([], { from: 'user' })
    expect(logs.join('\n')).toContain('No projects registered. Use: skills-ui project add <path>')
  })

  it('lists name, path, and agents', async () => {
    mockRegistry.listProjects.mockResolvedValue([
      { path: '/home/u/proj', name: 'proj', agents: ['claude-code'] },
    ])
    await projectsCommand().parseAsync([], { from: 'user' })
    expect(logs.join('\n')).toContain('proj  (/home/u/proj)  agents: claude-code')
  })
})

describe('project add', () => {
  it('registers an existing absolute directory with split --agents', async () => {
    mockRegistry.registerProject.mockImplementation(async (path: string, agents?: string[]) => ({
      path,
      name: 'rel',
      agents: agents ?? [],
    }))
    await projectAddCommand().parseAsync(['/projects/rel', '--agents', 'claude-code, codex'], { from: 'user' })
    expect(mockRegistry.registerProject).toHaveBeenCalledWith('/projects/rel', ['claude-code', 'codex'])
    expect(logs.join('\n')).toContain('✓ Registered rel')
    expect(logs.join('\n')).toContain('Agents: claude-code, codex')
  })

  it('UX-003: rejects a relative path', async () => {
    await expect(projectAddCommand().parseAsync(['./rel'], { from: 'user' })).rejects.toThrow(ExitError)
    expect(errs.join('\n')).toContain('absolute path')
    expect(mockRegistry.registerProject).not.toHaveBeenCalled()
  })

  it('UX-003: rejects a nonexistent path', async () => {
    mockStat.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
    await expect(projectAddCommand().parseAsync(['/missing'], { from: 'user' })).rejects.toThrow(ExitError)
    expect(errs.join('\n')).toContain('does not exist')
    expect(mockRegistry.registerProject).not.toHaveBeenCalled()
  })
})

describe('serve', () => {
  it.each(['99999', 'abc', '0'])('rejects invalid port %s with the valid range', async bad => {
    await expect(serveCommand().parseAsync(['--port', bad], { from: 'user' })).rejects.toThrow(ExitError)
    expect(errs.join('\n')).toContain('must be an integer between 1 and 65535')
  })
})
