/**
 * Web UI: Skill Detail page (Chromium).
 * Direct navigation by name — metadata comes straight from disk, so most of this
 * page works even while BUG-001 breaks the list.
 */
import { test, expect } from '../../helpers/env.js'
import { seedSkill, makeProject } from '../../helpers/skills-store.js'

test.describe('Skill Detail', () => {
  test('WEB-SKILLDETAIL-02: no projects registered → guidance empty state', async ({ page, server }) => {
    await seedSkill(server.home, 'basic-skill')
    await page.goto('/skills/basic-skill')
    await expect(page.getByRole('heading', { name: 'basic-skill' })).toBeVisible()
    await expect(page.getByText('No projects registered. Add a project to manage this skill.')).toBeVisible()
  })

  test('WEB-SKILLDETAIL-01: per-project per-agent toggle grid reflects and flips state', async ({ page, server }) => {
    await seedSkill(server.home, 'basic-skill')
    await makeProject(server.home, 'detail-proj', { agentDirs: ['.claude'] })

    await page.goto('/skills/basic-skill')
    await expect(page.getByRole('cell', { name: 'detail-proj' })).toBeVisible()

    // Default-enabled convention → toggle shows "Disable for claude-code"
    const toggle = page.getByTitle('Disable for claude-code')
    await expect(toggle).toBeVisible()
    await toggle.click()
    // After the round-trip the same button flips to "Enable for claude-code" (R7)
    await expect(page.getByTitle('Enable for claude-code')).toBeVisible()

    // And the state survives a reload (server truth, not client memory)
    await page.reload()
    await expect(page.getByTitle('Enable for claude-code')).toBeVisible()
  })

  test('URL-encoding: skill name with a space round-trips through the detail route', async ({ page, server }) => {
    await seedSkill(server.home, 'spaced skill')
    await page.goto(`/skills/${encodeURIComponent('spaced skill')}`)
    await expect(page.getByRole('heading', { name: 'spaced skill' })).toBeVisible()
  })

  test('UX-001/F-WEB-06: unknown skill must show a not-found state, not a placeholder page', async ({ page }) => {
    await page.goto('/skills/does-not-exist')
    await expect(page.getByText(/not found/i)).toBeVisible()
  })

  test('BUG-001-adjacent pin: unlisted-but-on-disk skill still renders via direct URL', async ({ page, server }) => {
    // skills@1.4.5 omits skills without a description from `list -g`, but the detail
    // route reads disk directly — document that listing truth ≠ disk truth.
    await seedSkill(server.home, 'no-frontmatter')
    await page.goto('/skills/no-frontmatter')
    await expect(page.getByRole('heading', { name: 'no-frontmatter' })).toBeVisible()
  })
})
