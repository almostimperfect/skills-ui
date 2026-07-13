/**
 * @network tier — REAL skill sources over the internet (container-outbound only).
 *
 * Excluded from the default run (playwright.config grepInvert). Enable with:
 *   docker run -e E2E_NETWORK=1 … npx playwright test -c e2e/playwright.config.ts
 *
 * Network is used ONLY to fetch skill sources; dependency installation happened at
 * image build time (hard rule of the approved plan).
 *
 * NOTE: skills-ui's own `add` accepts a single <source> argument and cannot pass
 * `--skill` through to the bundled binary. Multi-skill repos therefore go through
 * the bundled binary directly (documented functional gap — see e2e/README.md), and
 * skills-ui's view of the resulting store is asserted afterwards.
 */
import { test, expect } from '../../helpers/env.js'
import { runCli } from '../../helpers/cli.js'
import { storeDir } from '../../helpers/skills-store.js'
import { execFile } from 'child_process'
import { readdir } from 'fs/promises'
import { join, resolve } from 'path'
import { REPO_ROOT } from '../../helpers/env.js'

const SKILLS_BIN = resolve(REPO_ROOT, 'node_modules', '.bin', 'skills')
const NET_TIMEOUT = 300_000

function runSkillsBin(home: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise(res => {
    execFile(
      SKILLS_BIN,
      args,
      { env: { ...process.env, HOME: home }, timeout: NET_TIMEOUT },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { code?: number | string }) | null
        res({ code: e == null ? 0 : typeof e.code === 'number' ? e.code : 1, out: String(stdout) + String(stderr) })
      }
    )
  })
}

test.describe('@network real sources', () => {
  test.describe.configure({ timeout: NET_TIMEOUT + 60_000 })

  test('@network NET-01: skills-ui add owner/repo (single-skill repo, .git URL form)', async ({ server }) => {
    // Humanizer-zh: repo root is a single skill — installable through skills-ui itself.
    const res = await runCli(server.home, ['add', 'https://github.com/op7418/Humanizer-zh.git'], {
      timeoutMs: NET_TIMEOUT,
    })
    expect(res.code, res.stderr).toBe(0)
    expect((await readdir(storeDir(server.home))).length).toBeGreaterThan(0)
  })

  test('@network NET-02: owner/repo shorthand via skills-ui add', async ({ server }) => {
    const res = await runCli(server.home, ['add', 'almostimperfect/codex-ppt-skills'], {
      timeoutMs: NET_TIMEOUT,
    })
    expect(res.code, res.stderr).toBe(0)
    expect((await readdir(storeDir(server.home))).length).toBeGreaterThan(0)
  })

  test('@network NET-03: --skill selection from a multi-skill repo (bundled binary), then skills-ui sees it', async ({ server, request }) => {
    // anthropics/skills hosts many skills; select one. skills-ui add cannot pass --skill
    // (functional gap), so drive the bundled binary the way the user's commands do.
    const bin = await runSkillsBin(server.home, [
      'add', 'https://github.com/anthropics/skills',
      '--skill', 'skill-creator', '-g', '-y',
    ])
    expect(bin.code, bin.out).toBe(0)

    const store = await readdir(storeDir(server.home))
    const installed = store.find(n => n.includes('skill-creator'))
    expect(installed, `store contents: ${store.join(', ')}`).toBeTruthy()

    // skills-ui's disk-read detail endpoint sees the network-installed skill
    const detail = await request.get(`/api/skills/${encodeURIComponent(installed!)}`)
    expect(detail.status()).toBe(200)
  })

  test("@network NET-04: spaced --skill name ('Skill Development' from anthropics/claude-code)", async ({ server }) => {
    const bin = await runSkillsBin(server.home, [
      'add', 'https://github.com/anthropics/claude-code',
      '--skill', 'Skill Development', '-g', '-y',
    ])
    expect(bin.code, bin.out).toBe(0)
    expect((await readdir(storeDir(server.home))).length).toBeGreaterThan(0)
  })

  test('@network NET-05: nonexistent repo fails cleanly through skills-ui add', async ({ server }) => {
    const res = await runCli(server.home, ['add', 'this-org-does-not-exist-9x9x9/nope'], {
      timeoutMs: NET_TIMEOUT,
    })
    expect(res.code).toBe(1)
    expect(res.stderr).toContain('Error:')
    expect(res.stderr).not.toContain('    at ') // no stack trace to the user (R3)
  })

  test('@network NET-06: unreachable host fails cleanly (timeout/connection error surfaced)', async ({ server }) => {
    const res = await runCli(server.home, ['add', 'https://definitely-unreachable-host-9x9.invalid/repo.git'], {
      timeoutMs: NET_TIMEOUT,
    })
    expect(res.code).toBe(1)
    expect(res.stderr).toContain('Error:')
  })

  test('@network NET-07: API install path — POST /api/skills with a real source', async ({ request }) => {
    const res = await request.post('/api/skills', {
      data: { source: 'https://github.com/op7418/guizang-ppt-skill' },
      timeout: NET_TIMEOUT,
    })
    // 201 on success; 422 with a message if the repo shape changed upstream —
    // both are contract-valid; a 500 is not.
    expect([201, 422]).toContain(res.status())
  })
})
