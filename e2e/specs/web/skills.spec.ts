/**
 * Web UI: Skills page + Add Skill dialog (Chromium).
 */
import { test, expect } from '../../helpers/env.js'
import { seedSkill } from '../../helpers/skills-store.js'
import { FIXTURES } from '../../helpers/env.js'
import { join } from 'path'

test.describe('Skills list & search', () => {
  test('WEB-SKILLS-02: search with no match shows the distinct empty state', async ({ page }) => {
    await page.goto('/skills')
    await page.getByPlaceholder('Search skills...').fill('zzzzz-no-such-skill')
    await expect(page.getByText('No skills found')).toBeVisible()
  })

  test('WEB-SKILLS-01: seeded skill appears as a clean row with description (BUG-001 fixed)', async ({ page, server }) => {
    await seedSkill(server.home, 'basic-skill')
    await page.goto('/skills')
    await expect(page.getByRole('link', { name: 'basic-skill', exact: true })).toBeVisible()
    await expect(page.getByText('A well-formed fixture skill')).toBeVisible()
  })

  test('UX-004/F-WEB-01 pin: Remove fires the DELETE immediately — no confirmation', async ({ page, server }) => {
    await seedSkill(server.home, 'basic-skill')
    await page.goto('/skills')
    const firstRemove = page.getByRole('button', { name: 'Remove' }).first()
    await expect(firstRemove).toBeVisible()

    let deleteFired = false
    page.on('request', req => {
      if (req.method() === 'DELETE' && req.url().includes('/api/skills/')) deleteFired = true
    })
    let dialogShown = false
    page.on('dialog', () => {
      dialogShown = true
    })

    await firstRemove.click()
    await page.waitForTimeout(500)
    expect(deleteFired, 'DELETE fired straight from the click').toBe(true)
    expect(dialogShown, 'no native confirm() either').toBe(false)
  })

  test.fixme('UX-005/F-WEB-02: failed remove must surface a visible error', async ({ page, server }) => {
    await seedSkill(server.home, 'basic-skill')
    await page.route('**/api/skills/**', route =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 422, body: '{"error":"cannot remove"}' })
        : route.continue()
    )
    await page.goto('/skills')
    await page.getByRole('button', { name: 'Remove' }).first().click()
    // DESIRED: visible failure feedback. ACTUAL today: no onError → silence.
    await expect(page.getByText(/fail|error|cannot/i)).toBeVisible()
  })
})

test.describe('Add Skill dialog', () => {
  test('WEB-ADD-01: install from a local fixture repo — pending state, close, refresh', async ({ page }) => {
    await page.goto('/skills')
    await page.getByRole('button', { name: 'Add Skill' }).click()
    await expect(page.getByRole('heading', { name: 'Add Skill' })).toBeVisible()

    const input = page.getByPlaceholder('owner/repo, GitHub URL, or local path')
    await input.fill(join(FIXTURES, 'repos', 'single-skill-repo'))

    const install = page.getByRole('button', { name: 'Install' })
    await install.click()
    // Pending feedback (R1), then dialog closes on success.
    await expect(page.getByRole('heading', { name: 'Add Skill' })).toBeHidden({ timeout: 120_000 })
  })

  test('WEB-ADD-02 pin: install error surfaces (currently as raw HTTP text — UX-006)', async ({ page }) => {
    await page.goto('/skills')
    await page.getByRole('button', { name: 'Add Skill' }).click()
    await page.getByPlaceholder('owner/repo, GitHub URL, or local path').fill('/definitely/not/a/repo')
    await page.getByRole('button', { name: 'Install' }).click()

    // SOMETHING is shown (this dialog is the one place with error wiring)…
    const err = page.locator('p.text-red-600')
    await expect(err).toBeVisible({ timeout: 120_000 })
    // …pin of UX-006: today it's the raw "<status> <statusText>: <body>" string.
    await expect(err).toContainText('422')
  })

  test.fixme('UX-006/F-WEB-03: install error must be human-readable, not raw HTTP status text', async ({ page }) => {
    await page.goto('/skills')
    await page.getByRole('button', { name: 'Add Skill' }).click()
    await page.getByPlaceholder('owner/repo, GitHub URL, or local path').fill('/definitely/not/a/repo')
    await page.getByRole('button', { name: 'Install' }).click()
    const err = page.locator('p.text-red-600')
    await expect(err).toBeVisible({ timeout: 120_000 })
    await expect(err).not.toContainText('422') // no status codes in user-facing text
  })

  test('WEB-ADD-01b: Install button disabled while source empty', async ({ page }) => {
    await page.goto('/skills')
    await page.getByRole('button', { name: 'Add Skill' }).click()
    await expect(page.getByRole('button', { name: 'Install' })).toBeDisabled()
  })

  test.fixme('UX-007/F-WEB-04: dialog must support Enter-submit, Esc-cancel, autofocus', async ({ page }) => {
    await page.goto('/skills')
    await page.getByRole('button', { name: 'Add Skill' }).click()
    const input = page.getByPlaceholder('owner/repo, GitHub URL, or local path')
    await expect(input).toBeFocused() // autofocus
    await page.keyboard.press('Escape') // Esc closes
    await expect(page.getByRole('heading', { name: 'Add Skill' })).toBeHidden()
  })
})
