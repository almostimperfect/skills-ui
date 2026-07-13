/**
 * Web UI: Dashboard + shell navigation (Chromium).
 */
import { test, expect } from '../../helpers/env.js'
import { makeProject } from '../../helpers/skills-store.js'

test.describe('Dashboard & navigation', () => {
  test('WEB-NAV-01: sidebar navigates and marks the active item', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    await page.getByRole('link', { name: 'Skills', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible()

    await page.getByRole('link', { name: 'Projects', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
  })

  test('WEB-DASH-01: project count reflects registered projects', async ({ page, server }) => {
    await makeProject(server.home, 'dash-proj', { agentDirs: ['.claude'] })
    await page.goto('/')
    const projectCard = page.locator('div').filter({ hasText: /^1Registered projects$/ })
    await expect(projectCard.first()).toBeVisible()
  })

  test('WEB-DASH-01b: skill count is 0 on an empty store (BUG-001 fixed)', async ({ page }) => {
    await page.goto('/')
    const skillsCard = page.locator('div').filter({ hasText: /^0Installed skills$/ })
    await expect(skillsCard.first()).toBeVisible()
  })

  test.fixme('UX-008/F-WEB-05: API failure must render a distinct error state, not the loading dash', async ({ page }) => {
    // Simulate backend failure for the skills query.
    await page.route('**/api/skills', route => route.fulfill({ status: 503, body: '{"error":"down"}' }))
    await page.goto('/')
    // DESIRED: something visibly distinct from the loading "—".
    // ACTUAL today: Dashboard renders "—" for loading AND error identically.
    await expect(page.getByText(/error|failed|unavailable/i)).toBeVisible()
  })

  test('SPA deep links load directly (fallback serves index.html)', async ({ page }) => {
    const res = await page.goto('/projects')
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
  })
})
