// tests/core/skills-cli.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock child_process before importing the module
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

import { execFile } from 'child_process'
import { listSkills, addSkill, removeSkill, SkillsCliError } from '../../src/core/skills-cli.js'

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>

function mockSuccess(stdout: string, stderr = '') {
  mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: null, stdout: string, stderr: string) => void) => {
    cb(null, stdout, stderr)
  })
}

function mockFailure(code: number, stderr: string) {
  mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, cb: (err: Error) => void) => {
    const err = Object.assign(new Error(stderr), { code })
    cb(err)
  })
}

beforeEach(() => {
  mockExecFile.mockReset()
})

describe('listSkills', () => {
  it('returns empty array when no skills installed', async () => {
    mockSuccess('No skills installed.\n')
    const skills = await listSkills()
    expect(skills).toEqual([])
  })

  it('parses skill names from output lines', async () => {
    mockSuccess('tdd-workflow\nreact-best-practices\n')
    const skills = await listSkills()
    expect(skills.map(s => s.name)).toEqual(['tdd-workflow', 'react-best-practices'])
  })
})

describe('addSkill', () => {
  it('resolves on success', async () => {
    mockSuccess('Installed tdd-workflow\n')
    await expect(addSkill('owner/repo')).resolves.toBeUndefined()
  })

  it('throws SkillsCliError on non-zero exit', async () => {
    mockFailure(1, 'Error: repo not found')
    await expect(addSkill('bad/repo')).rejects.toBeInstanceOf(SkillsCliError)
  })
})

describe('removeSkill', () => {
  it('resolves on success', async () => {
    mockSuccess('Removed tdd-workflow\n')
    await expect(removeSkill('tdd-workflow')).resolves.toBeUndefined()
  })
})
