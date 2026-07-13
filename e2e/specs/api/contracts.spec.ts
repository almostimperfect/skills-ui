/**
 * API contract E2E against the real server (real core, real skills binary, isolated HOME).
 * Covers validation/status-code contracts not visible through the UI, plus the BUG-001 pin.
 */
import { test, expect } from '../../helpers/env.js'
import { seedSkill, makeProject } from '../../helpers/skills-store.js'

test.describe('GET /api/agents', () => {
  test('returns the supported agent whitelist', async ({ request }) => {
    const res = await request.get('/api/agents')
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual(['claude-code', 'codex', 'antigravity', 'gemini'])
  })
})

test.describe('GET /api/skills — clean listing (BUG-001 fixed)', () => {
  test('empty store returns []; seeded skills appear by clean name with metadata', async ({ request, server }) => {
    const empty = await request.get('/api/skills')
    expect(await empty.json()).toEqual([])

    await seedSkill(server.home, 'basic-skill')
    await seedSkill(server.home, 'spaced skill')
    const res = await request.get('/api/skills')
    const skills = (await res.json()) as { name: string; description: string }[]
    const names = skills.map(s => s.name)
    expect(names).toContain('basic-skill')
    expect(names).toContain('spaced skill') // space survives the path-suffix split
    expect(names.join()).not.toContain('\u001b') // no ANSI residue
    expect(skills.find(s => s.name === 'basic-skill')?.description).toContain('well-formed')
  })
})

test.describe('GET /api/skills/:name — direct disk metadata (unaffected by BUG-001)', () => {
  test('reads seeded frontmatter live from disk, URL-encoded names round-trip', async ({ request, server }) => {
    await seedSkill(server.home, 'basic-skill')
    await seedSkill(server.home, 'spaced skill')

    const basic = await request.get('/api/skills/basic-skill')
    expect(basic.status()).toBe(200)
    expect(await basic.json()).toMatchObject({
      name: 'basic-skill',
      description: 'A well-formed fixture skill with complete frontmatter.',
    })

    const spaced = await request.get(`/api/skills/${encodeURIComponent('spaced skill')}`)
    expect(spaced.status()).toBe(200)
    expect(((await spaced.json()) as { name: string }).name).toBe('spaced skill')
  })

  test('UX-001/F-WEB-06: unknown skill must return 404, not a 200 placeholder', async ({ request }) => {
    const res = await request.get('/api/skills/does-not-exist')
    expect(res.status()).toBe(404)
  })
})

test.describe('POST /api/skills', () => {
  test('400 when source missing; 422 with message for un-installable source', async ({ request }) => {
    const missing = await request.post('/api/skills', { data: {} })
    expect(missing.status()).toBe(400)
    expect(((await missing.json()) as { error: string }).error).toContain('source')

    const bad = await request.post('/api/skills', { data: { source: '/definitely/not/a/repo' } })
    expect(bad.status()).toBe(422)
    expect(((await bad.json()) as { error: string }).error).toBeTruthy()
  })
})

test.describe('POST /api/skills/:name/enable|disable — validation contract', () => {
  test('400 for missing fields and for agents outside the whitelist', async ({ request }) => {
    for (const op of ['enable', 'disable']) {
      const missing = await request.post(`/api/skills/x/${op}`, { data: {} })
      expect(missing.status(), op).toBe(400)

      const badAgent = await request.post(`/api/skills/x/${op}`, {
        data: { projectPath: '/tmp/whatever', agent: 'nonsense' },
      })
      expect(badAgent.status(), op).toBe(400)
      expect(((await badAgent.json()) as { error: string }).error).toContain('claude-code')
    }
  })

  test('DEBT-001: enable for an unregistered project must be rejected (404), not accepted', async ({ request, server }) => {
    await seedSkill(server.home, 'basic-skill')
    const res = await request.post('/api/skills/basic-skill/enable', {
      data: { projectPath: '/not/registered', agent: 'claude-code' },
    })
    // DESIRED: 404/400. ACTUAL today: 200 {ok:true}, state written for unknown project.
    expect([400, 404]).toContain(res.status())
  })
})

test.describe('Projects API contract', () => {
  test('POST validates path (missing / relative / nonexistent)', async ({ request }) => {
    expect((await request.post('/api/projects', { data: {} })).status()).toBe(400)
    expect((await request.post('/api/projects', { data: { path: './rel' } })).status()).toBe(400)
    expect((await request.post('/api/projects', { data: { path: '/nope/nope' } })).status()).toBe(400)
  })

  test('PATCH /api/projects/:path updates name; 404 for unknown project (no UI covers this)', async ({ request, server }) => {
    const proj = await makeProject(server.home, 'patch-me', { agentDirs: ['.claude'] })

    const ok = await request.patch(`/api/projects/${encodeURIComponent(proj)}`, {
      data: { name: 'renamed' },
    })
    expect(ok.status()).toBe(200)
    expect(((await ok.json()) as { name: string }).name).toBe('renamed')

    const gone = await request.patch(`/api/projects/${encodeURIComponent('/not/registered')}`, {
      data: { name: 'x' },
    })
    expect(gone.status()).toBe(404)
  })

  test('DELETE unregisters and cleans state; unknown /api 404s as JSON', async ({ request, server }) => {
    const proj = await makeProject(server.home, 'del-me', { agentDirs: ['.claude'] })
    const del = await request.delete(`/api/projects/${encodeURIComponent(proj)}`)
    expect(del.status()).toBe(204)

    const list = await request.get('/api/projects')
    expect(((await list.json()) as { path: string }[]).map(p => p.path)).not.toContain(proj)

    const nf = await request.get('/api/definitely-not-a-route')
    expect(nf.status()).toBe(404)
    expect(((await nf.json()) as { error: string }).error).toBe('Not found')
  })
})
