/**
 * CLI functional E2E: enable / disable + on-disk symlink truth.
 * Known-broken desired behaviors are test.fixme, titled with their registry IDs.
 */
import { test, expect } from '../../helpers/env.js'
import { runCli } from '../../helpers/cli.js'
import { seedSkill, makeProject, agentLinkPath, removeCanonical } from '../../helpers/skills-store.js'
import { lstat, readlink } from 'fs/promises'

async function isSymlink(p: string): Promise<boolean> {
  try {
    return (await lstat(p)).isSymbolicLink()
  } catch {
    return false
  }
}

test.describe('CLI: enable/disable happy path', () => {
  test('CLI-ENABLE-02+01: disable removes the agent symlink; enable recreates it', async ({ server }) => {
    await seedSkill(server.home, 'basic-skill')
    const proj = await makeProject(server.home, 'proj-a', { agentDirs: ['.claude'] })
    const link = agentLinkPath(proj, 'claude-code', 'basic-skill')

    const dis = await runCli(server.home, ['disable', 'basic-skill', '--project', proj, '--agent', 'claude-code'])
    expect(dis.code, dis.stderr).toBe(0)
    expect(dis.stdout).toContain('✓ Disabled basic-skill')
    expect(await isSymlink(link)).toBe(false)

    const en = await runCli(server.home, ['enable', 'basic-skill', '--project', proj, '--agent', 'claude-code'])
    expect(en.code, en.stderr).toBe(0)
    expect(en.stdout).toContain('✓ Enabled basic-skill')
    expect(await isSymlink(link)).toBe(true)
    expect(await readlink(link)).toContain('basic-skill')
  })

  test('CLI-LIST-02: list --project shows per-agent disabled truthfully (BUG-001 fixed)', async ({ server }) => {
    await seedSkill(server.home, 'basic-skill')
    const proj = await makeProject(server.home, 'proj-b', { agentDirs: ['.claude'] })
    await runCli(server.home, ['disable', 'basic-skill', '--project', proj, '--agent', 'claude-code'])

    const res = await runCli(server.home, ['list', '--project', proj])
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('claude-code: disabled')
  })

  test('CLI-LIST-03: list --project with unregistered project errors clearly', async ({ server }) => {
    await seedSkill(server.home, 'basic-skill')
    const res = await runCli(server.home, ['list', '--project', '/not/registered'])
    expect(res.code).toBe(1)
    expect(res.stderr).toContain('Project not found')
  })

  test('SCEN-REENABLE-01: enabling an already-enabled skill is a safe no-op', async ({ server }) => {
    await seedSkill(server.home, 'basic-skill')
    const proj = await makeProject(server.home, 'proj-c', { agentDirs: ['.claude'] })
    const en1 = await runCli(server.home, ['enable', 'basic-skill', '--project', proj, '--agent', 'claude-code'])
    expect(en1.code).toBe(0)
    const en2 = await runCli(server.home, ['enable', 'basic-skill', '--project', proj, '--agent', 'claude-code'])
    expect(en2.code, 'second enable must not crash on EEXIST').toBe(0)
  })
})

test.describe('CLI: enable/disable validation gaps (registered findings)', () => {
  test.fixme('DEBT-001/F-CLI-02: enable with unknown --agent must be rejected, not ✓', async ({ server }) => {
    await seedSkill(server.home, 'basic-skill')
    const proj = await makeProject(server.home, 'proj-d', { agentDirs: ['.claude'] })
    const res = await runCli(server.home, ['enable', 'basic-skill', '--project', proj, '--agent', 'nonsense'])
    // DESIRED: exit 1 + clear message. ACTUAL today: exit 0 + "✓ Enabled ... for nonsense".
    expect(res.code).toBe(1)
    expect(res.stderr).toMatch(/agent/i)
  })

  test.fixme('DEBT-001/F-CLI-02: enable for an unregistered project must be rejected', async ({ server }) => {
    await seedSkill(server.home, 'basic-skill')
    const res = await runCli(server.home, ['enable', 'basic-skill', '--project', '/not/registered', '--agent', 'claude-code'])
    // DESIRED: exit 1. ACTUAL today: exit 0, state written for an unknown project.
    expect(res.code).toBe(1)
  })

  test('DEBT-002/F-CLI-03: enabling an uninstalled skill must not create a dangling symlink', async ({ server }) => {
    const proj = await makeProject(server.home, 'proj-e', { agentDirs: ['.claude'] })
    const res = await runCli(server.home, ['enable', 'ghost-skill', '--project', proj, '--agent', 'claude-code'])
    // DESIRED: rejected. ACTUAL today: exit 0 and a dangling link at .claude/skills/ghost-skill.
    expect(res.code).toBe(1)
    expect(await isSymlink(agentLinkPath(proj, 'claude-code', 'ghost-skill'))).toBe(false)
  })

  test('SCEN-DANGLING-01: current behavior — dangling link is created (pins DEBT-002 reality)', async ({ server }) => {
    // This is the TRUTH-PINNING twin of the fixme above: it asserts today's actual
    // behavior so a silent change is noticed. Delete it when DEBT-002 is fixed.
    const proj = await makeProject(server.home, 'proj-f', { agentDirs: ['.claude'] })
    await seedSkill(server.home, 'basic-skill')
    await runCli(server.home, ['enable', 'basic-skill', '--project', proj, '--agent', 'claude-code'])
    await removeCanonical(server.home, 'basic-skill')
    const link = agentLinkPath(proj, 'claude-code', 'basic-skill')
    expect(await isSymlink(link)).toBe(true) // link survives canonical removal → dangling
    // skills-ui list must not crash when the store contains a project with dangling links
    const res = await runCli(server.home, ['list', '--project', proj])
    expect(res.code === 0 || res.code === 1).toBe(true)
    expect(res.stderr).not.toContain('at ') // no stack trace either way
  })
})
