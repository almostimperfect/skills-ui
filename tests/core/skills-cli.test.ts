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

  // BUG-001 regression: skills >=1.4.x output — hardcoded ANSI, header, path suffix,
  // Agents detail lines, and a changed empty-store message.
  const ESC = '\u001b'

  it('BUG-001: parses the skills@1.4.x ANSI format into clean names', async () => {
    mockSuccess(
      `${ESC}[1mGlobal Skills${ESC}[0m\n` +
        `\n` +
        `${ESC}[36mtdd-workflow${ESC}[0m ${ESC}[38;5;102m~/.agents/skills/tdd-workflow${ESC}[0m\n` +
        `  ${ESC}[38;5;102mAgents:${ESC}[0m ${ESC}[33mnot linked${ESC}[0m\n` +
        `${ESC}[36mspaced skill${ESC}[0m ${ESC}[38;5;102m~/.agents/skills/spaced skill${ESC}[0m\n` +
        `  ${ESC}[38;5;102mAgents:${ESC}[0m ${ESC}[33mclaude-code${ESC}[0m\n`
    )
    const skills = await listSkills()
    expect(skills.map(s => s.name)).toEqual(['tdd-workflow', 'spaced skill'])
  })

  it('BUG-001: skills@1.4.x empty-store message parses as empty, not phantom skills', async () => {
    mockSuccess(
      `${ESC}[38;5;102mNo global skills found.${ESC}[0m\n` +
        `${ESC}[38;5;102mTry listing project skills without -g${ESC}[0m\n`
    )
    const skills = await listSkills()
    expect(skills).toEqual([])
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
