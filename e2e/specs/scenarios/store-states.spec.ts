/**
 * Scenario coverage (offline): store shapes, install methods, post-install edits,
 * version-over-install, dangling links — requirement 5 of the approved plan.
 *
 * Seeding here validates skills-ui's RUNTIME STATE HANDLING (see helpers/skills-store.ts
 * boundary note); installer behavior itself is covered in cli/add-remove-list.spec.ts
 * and the @network tier.
 */
import { test, expect } from '../../helpers/env.js'
import {
  seedSkill,
  seedRawSkill,
  mutateSkill,
  removeCanonical,
  makeProject,
  storeDir,
} from '../../helpers/skills-store.js'
import { runCli } from '../../helpers/cli.js'
import { cp, symlink, mkdir, readlink, lstat } from 'fs/promises'
import { join } from 'path'
import { FIXTURES } from '../../helpers/env.js'

test.describe('Metadata shapes (direct disk reads — GET /api/skills/:name)', () => {
  test('SCEN-META-01: no-frontmatter skill falls back to dir name, empty description', async ({ request, server }) => {
    await seedSkill(server.home, 'no-frontmatter')
    const res = await request.get('/api/skills/no-frontmatter')
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ name: 'no-frontmatter', description: '' })
  })

  test('SCEN-META-02: malformed YAML frontmatter must not crash the API', async ({ request, server }) => {
    await seedSkill(server.home, 'bad-yaml')
    const res = await request.get('/api/skills/bad-yaml')
    // Graceful degradation: 200 with dir-name fallback (gray-matter throw is caught)
    expect(res.status()).toBe(200)
    expect(((await res.json()) as { name: string }).name).toBe('bad-yaml')
  })

  test('SCEN-EDIT-01: post-install manual edit is reflected live (no metadata cache)', async ({ request, server }) => {
    await seedSkill(server.home, 'basic-skill')
    const before = await request.get('/api/skills/basic-skill')
    expect(((await before.json()) as { description: string }).description).toContain('well-formed')

    await mutateSkill(
      server.home,
      'basic-skill',
      '---\nname: basic-skill\ndescription: EDITED AFTER INSTALL\n---\n# v2 body\n'
    )
    const after = await request.get('/api/skills/basic-skill')
    expect(((await after.json()) as { description: string }).description).toBe('EDITED AFTER INSTALL')
  })

  test('SCEN-VERSION-01: v1→v2 overwrite — list/detail reflect current disk truth only', async ({ request, server }) => {
    // skills-ui tracks no versions: simulate an upgrade by overwriting the canonical dir.
    await seedRawSkill(server.home, 'versioned', '---\nname: versioned\ndescription: v1\n---\n# v1\n')
    await mutateSkill(server.home, 'versioned', '---\nname: versioned\ndescription: v2\n---\n# v2\n')
    const res = await request.get('/api/skills/versioned')
    expect(((await res.json()) as { description: string }).description).toBe('v2')
    // No residue of v1 anywhere in the store
    const detail = JSON.stringify(await (await request.get('/api/skills/versioned')).json())
    expect(detail).not.toContain('v1')
  })
})

test.describe('Install methods: symlink vs copy layouts side by side', () => {
  test('SCEN-METHOD-01: store accepts both a real dir (copy-style) and a symlinked dir', async ({ request, server }) => {
    // copy-style: real directory in the store (what `skills add --copy` produces)
    await seedSkill(server.home, 'basic-skill', 'copy-style')

    // symlink-style: store entry is itself a symlink to a source dir elsewhere
    const src = join(server.home, 'src-skill')
    await cp(join(FIXTURES, 'skills', 'rich-skill'), src, { recursive: true })
    await mkdir(storeDir(server.home), { recursive: true })
    await symlink(src, join(storeDir(server.home), 'linked-style'))

    for (const name of ['copy-style', 'linked-style']) {
      const res = await request.get(`/api/skills/${name}`)
      expect(res.status(), name).toBe(200)
    }
    // Metadata reads through the symlink transparently
    const linked = await request.get('/api/skills/linked-style')
    expect(((await linked.json()) as { description: string }).description).toContain('Multi-file')
  })

  test('SCEN-METHOD-02: enable/disable produce correct agent symlinks for a multi-file skill', async ({ server }) => {
    await seedSkill(server.home, 'rich-skill')
    const proj = await makeProject(server.home, 'method-p', { agentDirs: ['.claude'] })

    const en = await runCli(server.home, ['enable', 'rich-skill', '--project', proj, '--agent', 'claude-code'])
    expect(en.code).toBe(0)
    const link = join(proj, '.claude', 'skills', 'rich-skill')
    expect((await lstat(link)).isSymbolicLink()).toBe(true)
    // The link targets the canonical store — supplementary files travel with it
    const target = await readlink(link)
    expect(target).toContain(join('.agents', 'skills', 'rich-skill'))
  })
})

test.describe('Broken store states must not take the product down', () => {
  test('SCEN-DANGLING-02: skill removed behind an enabled project — API stays up', async ({ request, server }) => {
    await seedSkill(server.home, 'basic-skill')
    const proj = await makeProject(server.home, 'dangle-p', { agentDirs: ['.claude'] })
    await runCli(server.home, ['enable', 'basic-skill', '--project', proj, '--agent', 'claude-code'])
    await removeCanonical(server.home, 'basic-skill')

    // Missing canonical truth is a not-found response (UX-001), never a 500.
    const detail = await request.get('/api/skills/basic-skill')
    expect(detail.status()).toBe(404)

    // Project matrix endpoint must not 500 either
    const matrix = await request.get(`/api/projects/${encodeURIComponent(proj)}`)
    expect(matrix.status()).toBe(200)
  })

  test('SCEN-DANGLING-03: dangling symlink inside the store itself must not 500 the list', async ({ request, server }) => {
    await mkdir(storeDir(server.home), { recursive: true })
    await symlink(join(server.home, 'gone-target'), join(storeDir(server.home), 'ghost-link'))
    const res = await request.get('/api/skills')
    expect([200, 503]).toContain(res.status()) // never a 500 crash
  })
})
