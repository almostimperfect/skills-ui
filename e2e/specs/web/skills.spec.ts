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

  test('UX-004/F-WEB-01: Remove asks for confirmation before DELETE', async ({ page, server }) => {
    await seedSkill(server.home, 'basic-skill')
    await page.goto('/skills')
    const firstRemove = page.getByRole('button', { name: 'Remove' }).first()
    await expect(firstRemove).toBeVisible()

    let deleteFired = false
    page.on('request', req => {
      if (req.method() === 'DELETE' && req.url().includes('/api/skills/')) deleteFired = true
    })
    let dialogShown = false
    page.once('dialog', async dialog => {
      dialogShown = true
      expect(dialog.type()).toBe('confirm')
      expect(deleteFired, 'DELETE must wait for confirmation').toBe(false)
      await dialog.accept()
    })

    await firstRemove.click()
    await expect(page.getByRole('link', { name: 'basic-skill', exact: true })).toBeHidden()
    expect(dialogShown).toBe(true)
    expect(deleteFired).toBe(true)
  })

  test('UX-005/F-WEB-02: failed remove must surface a visible error', async ({ page, server }) => {
    await seedSkill(server.home, 'basic-skill')
    await page.route('**/api/skills/**', route =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 422, body: '{"error":"cannot remove"}' })
        : route.continue()
    )
    await page.goto('/skills')
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Remove' }).first().click()
    await expect(page.getByRole('alert')).toContainText(/cannot remove/i)
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

  test('WEB-ADD-02: install error surfaces as a human-readable message', async ({ page }) => {
    await page.goto('/skills')
    await page.getByRole('button', { name: 'Add Skill' }).click()
    await page.getByPlaceholder('owner/repo, GitHub URL, or local path').fill('/definitely/not/a/repo')
    await page.getByRole('button', { name: 'Install' }).click()

    // SOMETHING is shown (this dialog is the one place with error wiring)…
    const err = page.getByRole('alert')
    await expect(err).toBeVisible({ timeout: 120_000 })
    await expect(err).not.toContainText('422')
  })

  test('WEB-ADD-01b: Install button disabled while source empty', async ({ page }) => {
    await page.goto('/skills')
    await page.getByRole('button', { name: 'Add Skill' }).click()
    await expect(page.getByRole('button', { name: 'Install' })).toBeDisabled()
  })

  test('UX-007/F-WEB-04: dialog supports Esc-cancel and autofocus', async ({ page }) => {
    await page.goto('/skills')
    await page.getByRole('button', { name: 'Add Skill' }).click()
    const input = page.getByPlaceholder('owner/repo, GitHub URL, or local path')
    await expect(input).toBeFocused() // autofocus
    await page.keyboard.press('Escape') // Esc closes
    await expect(page.getByRole('heading', { name: 'Add Skill' })).toBeHidden()
  })

  test('UX-007/F-WEB-04: dialog supports Enter-submit', async ({ page }) => {
    await page.route('**/api/skills', route =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' })
        : route.continue()
    )
    await page.goto('/skills')
    await page.getByRole('button', { name: 'Add Skill' }).click()
    await page.getByPlaceholder('owner/repo, GitHub URL, or local path').fill('owner/repo')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Add Skill' })).toBeHidden()
  })
})
