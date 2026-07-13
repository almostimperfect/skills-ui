/**
 * Helpers to put the skills store into a known state, entirely offline.
 *
 * BOUNDARY (approved-plan rule): direct seeding (`seedSkill`, `seedCopy`,
 * `danglingAgentLink`) validates skills-ui's RUNTIME STATE HANDLING only.
 * Any test asserting INSTALLER behavior must go through a real `skills add`
 * (`installLocal` with a local fixture path in the offline tier, or real
 * network sources in the @network tier). Never assert install semantics
 * against a seeded store.
 */
import { cp, mkdir, symlink, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { FIXTURES } from './env.js'
import { runCli } from './cli.js'

/** Canonical global store dir for a given isolated HOME (mirrors src/core/constants.ts). */
export const storeDir = (home: string) => join(home, '.agents', 'skills')

/** Copy a fixture skill directory into the canonical store (seed — state handling only). */
export async function seedSkill(home: string, fixtureName: string, asName?: string): Promise<string> {
  const dest = join(storeDir(home), asName ?? fixtureName)
  await mkdir(storeDir(home), { recursive: true })
  await cp(join(FIXTURES, 'skills', fixtureName), dest, { recursive: true })
  return dest
}

/** Seed a raw (non-fixture) skill with the given SKILL.md content. */
export async function seedRawSkill(home: string, name: string, skillMd: string): Promise<string> {
  const dest = join(storeDir(home), name)
  await mkdir(dest, { recursive: true })
  await writeFile(join(dest, 'SKILL.md'), skillMd, 'utf-8')
  return dest
}

/** Overwrite a seeded skill's SKILL.md (post-install manual edit / v1→v2 simulation). */
export async function mutateSkill(home: string, name: string, newSkillMd: string): Promise<void> {
  await writeFile(join(storeDir(home), name, 'SKILL.md'), newSkillMd, 'utf-8')
}

/** Remove a skill's canonical dir but leave any agent symlinks behind (dangling link scenario). */
export async function removeCanonical(home: string, name: string): Promise<void> {
  await rm(join(storeDir(home), name), { recursive: true, force: true })
}

/**
 * Real installer path (offline): `skills-ui add <localFixtureRepoPath>` drives the
 * bundled `skills` binary with -g -y against a local directory. Use for installer assertions.
 */
export async function installLocal(home: string, fixtureRepo: string) {
  return runCli(home, ['add', join(FIXTURES, 'repos', fixtureRepo)], { timeoutMs: 120_000 })
}

export interface ProjectOptions {
  /** Agent dot-dirs to pre-create so registration auto-detects them, e.g. ['.claude', '.codex'] */
  agentDirs?: string[]
  /** Explicit --agents value; skips auto-detection */
  agents?: string
}

/**
 * Create a project directory under the isolated HOME and register it via the real CLI.
 * Returns the absolute project path.
 */
export async function makeProject(home: string, name: string, opts: ProjectOptions = {}): Promise<string> {
  const dir = join(home, 'projects', name)
  await mkdir(dir, { recursive: true })
  for (const d of opts.agentDirs ?? []) {
    await mkdir(join(dir, d), { recursive: true })
  }
  const args = ['project', 'add', dir]
  if (opts.agents) args.push('--agents', opts.agents)
  const res = await runCli(home, args)
  if (res.code !== 0) throw new Error(`project add failed: ${res.stderr || res.stdout}`)
  return dir
}

/** Path where an agent symlink for a skill lives inside a project (mirrors AGENT_DIRS). */
export function agentLinkPath(projectDir: string, agent: string, skillName: string): string {
  const AGENT_DIRS: Record<string, string> = {
    'claude-code': '.claude/skills',
    codex: '.codex/skills',
    antigravity: '.antigravity/skills',
    gemini: '.gemini/skills',
  }
  return join(projectDir, AGENT_DIRS[agent], skillName)
}

/** Create an agent symlink pointing at a canonical dir that may or may not exist. */
export async function danglingAgentLink(
  home: string,
  projectDir: string,
  agent: string,
  skillName: string
): Promise<string> {
  const link = agentLinkPath(projectDir, agent, skillName)
  await mkdir(join(link, '..'), { recursive: true })
  await symlink(join(storeDir(home), skillName), link)
  return link
}
