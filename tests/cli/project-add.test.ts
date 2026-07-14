import { beforeEach, describe, expect, it, vi } from 'vitest'

class ExitError extends Error {}

const { mockRegistry, mockInventory, mockStat } = vi.hoisted(() => ({
  mockRegistry: {
    registerProject: vi.fn(),
    listProjects: vi.fn(),
  },
  mockInventory: { reconcile: vi.fn() },
  mockStat: vi.fn(),
}))

vi.mock('../../src/core/projects.js', () => ({
  createProjectRegistry: vi.fn(() => mockRegistry),
}))
vi.mock('../../src/core/inventory.js', () => ({
  createInventoryManager: vi.fn(() => mockInventory),
}))
vi.mock('fs/promises', () => ({ stat: mockStat }))

import { projectAddCommand } from '../../src/cli/commands/project-add.js'

beforeEach(() => {
  vi.clearAllMocks()
  mockRegistry.registerProject.mockResolvedValue({
    path: '/projects/app',
    name: 'app',
    agents: ['codex'],
  })
  mockRegistry.listProjects.mockResolvedValue([])
  mockInventory.reconcile.mockResolvedValue({ skills: {} })
  mockStat.mockResolvedValue({ isDirectory: () => true })
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(process, 'exit').mockImplementation(() => { throw new ExitError('exit 1') })
})

describe('project add path validation', () => {
  it('registers an existing absolute directory', async () => {
    await projectAddCommand().parseAsync(['/projects/app'], { from: 'user' })
    expect(mockStat).toHaveBeenCalledWith('/projects/app')
    expect(mockRegistry.registerProject).toHaveBeenCalledWith('/projects/app', undefined)
  })

  it('rejects a relative path before registry mutation', async () => {
    await expect(projectAddCommand().parseAsync(['./app'], { from: 'user' })).rejects.toThrow(ExitError)
    expect(mockRegistry.registerProject).not.toHaveBeenCalled()
  })

  it('rejects a missing path before registry mutation', async () => {
    mockStat.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
    await expect(projectAddCommand().parseAsync(['/missing'], { from: 'user' })).rejects.toThrow(ExitError)
    expect(mockRegistry.registerProject).not.toHaveBeenCalled()
  })

  it('rejects a path that is not a directory', async () => {
    mockStat.mockResolvedValueOnce({ isDirectory: () => false })
    await expect(projectAddCommand().parseAsync(['/tmp/file'], { from: 'user' })).rejects.toThrow(ExitError)
    expect(mockRegistry.registerProject).not.toHaveBeenCalled()
  })
})
