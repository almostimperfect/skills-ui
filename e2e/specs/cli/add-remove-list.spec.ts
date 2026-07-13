/**
 * CLI functional E2E: add / list / remove — offline tier.
 * Case IDs map to docs/testing/functional-interaction-test-design.md.
 * Installer assertions go through the REAL bundled `skills` binary via local fixture repos.
 */
import { test, expect } from '../../helpers/env.js'
import { runCli } from '../../helpers/cli.js'
import { installLocal, seedSkill, storeDir } from '../../helpers/skills-store.js'
import { access, readdir } from 'fs/promises'
import { join } from 'path'

test.describe('CLI: first run / empty states', () => {
  test('CLI-EMPTY-01: list with nothing installed prints the empty message, exit 0 (BUG-001 fixed)', async ({ server }) => {
    const res = await runCli(server.home, ['list'])
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('No skills installed.')
  })

  test('CLI-EMPTY-02: projects with nothing registered prints actionable next step', async ({ server }) => {
    const res = await runCli(server.home, ['projects'])
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('No projects registered')
    expect(res.stdout).toContain('skills-ui project add')
  })
})

test.describe('CLI: install a skill (real installer, local source)', () => {
  test('CLI-ADD-01: install from a local single-skill repo succeeds with feedback', async ({ server }) => {
    const res = await installLocal(server.home, 'single-skill-repo')
    expect(res.code, res.stderr).toBe(0)
    expect(res.stdout).toContain('Installing')
    expect(res.stdout).toContain('✓ Installed')
    // R7 truthfulness: assert against DISK truth (immune to BUG-001 list parsing)
    const installed = await readdir(storeDir(server.home))
    expect(installed.length).toBeGreaterThan(0)
  })

  test('CLI-ADD-02: install from a nonexistent local path fails with error, exit 1', async ({ server }) => {
    const res = await runCli(server.home, ['add', '/definitely/not/a/skill/repo'], { timeoutMs: 120_000 })
    expect(res.code).toBe(1)
    expect(res.stderr).toContain('Error:')
  })

  test('SCEN-READD-01: re-adding an already-installed source is not a hard failure', async ({ server }) => {
    const first = await installLocal(server.home, 'single-skill-repo')
    expect(first.code, first.stderr).toBe(0)
    const second = await installLocal(server.home, 'single-skill-repo')
    // Idempotent re-add: either succeeds (overwrite) or fails with a CLEAR message —
    // never a stack trace. Record actual behavior.
    if (second.code !== 0) {
      expect(second.stderr).toContain('Error:')
      expect(second.stderr).not.toContain('at ') // no raw stack frames (R3)
    }
  })
})

test.describe('CLI: browse (list)', () => {
  test('CLI-LIST-01: seeded skill names at least appear in list output', async ({ server }) => {
    // Loose containment survives BUG-001 (names are embedded in ANSI-decorated lines).
    await seedSkill(server.home, 'basic-skill')
    await seedSkill(server.home, 'rich-skill')
    const res = await runCli(server.home, ['list'])
    expect(res.code).toBe(0)
    expect(res.stdout).toContain('basic-skill')
    expect(res.stdout).toContain('rich-skill')
  })

  test('CLI-LIST-01 strict: clean names + descriptions, no ANSI/header lines (BUG-001 fixed)', async ({ server }) => {
    await seedSkill(server.home, 'basic-skill')
    const res = await runCli(server.home, ['list'])
    expect(res.stdout).not.toContain('\u001b') // no raw ANSI escapes
    expect(res.stdout).not.toContain('Global Skills') // no pass-through header
    expect(res.stdout).toContain('A well-formed fixture skill') // description rendered
  })
})

test.describe('CLI: remove a skill', () => {
  test('CLI-REMOVE-01: remove uninstalls and cleans disabled state', async ({ server }) => {
    await installLocal(server.home, 'single-skill-repo')
    // Derive the installed name from DISK truth (installer decides the store dir name;
    // list output is unusable for this while BUG-001 stands)
    const [name] = await readdir(storeDir(server.home))
    expect(name, 'installer must have created a store dir').toBeTruthy()
    const res = await runCli(server.home, ['remove', name])
    expect(res.code, res.stderr).toBe(0)
    expect(res.stdout).toContain(`✓ Removed ${name}`)

    await expect(access(join(storeDir(server.home), name))).rejects.toThrow()
  })

  test('UX-011: removing a nonexistent skill must error (exit 1), not report ✓ (CLI-REMOVE-02)', async ({ server }) => {
    const res = await runCli(server.home, ['remove', 'ghost-skill'])
    expect(res.code).toBe(1)
    expect(res.stderr).toContain('Error:')
  })

})
