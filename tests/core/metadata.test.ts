// tests/core/metadata.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { parseSkillMetadata } from '../../src/core/metadata.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'skills-meta-test-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true })
})

it('parses name and description from frontmatter', async () => {
  const skillDir = join(dir, 'my-skill')
  await mkdir(skillDir)
  await writeFile(
    join(skillDir, 'SKILL.md'),
    `---\nname: My Skill\ndescription: Does something useful\n---\n\n# Body`
  )
  const meta = await parseSkillMetadata(skillDir, 'my-skill')
  expect(meta.name).toBe('My Skill')
  expect(meta.description).toBe('Does something useful')
})

it('falls back to dir name when frontmatter is missing', async () => {
  const skillDir = join(dir, 'bare-skill')
  await mkdir(skillDir)
  await writeFile(join(skillDir, 'SKILL.md'), '# No frontmatter here')
  const meta = await parseSkillMetadata(skillDir, 'bare-skill')
  expect(meta.name).toBe('bare-skill')
  expect(meta.description).toBe('')
})

it('falls back gracefully when SKILL.md is absent', async () => {
  const skillDir = join(dir, 'empty-skill')
  await mkdir(skillDir)
  const meta = await parseSkillMetadata(skillDir, 'empty-skill')
  expect(meta.name).toBe('empty-skill')
})
