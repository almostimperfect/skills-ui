/**
 * Web UI: Projects page + Project Detail (Chromium).
 */
import { test, expect } from '../../helpers/env.js'
import { seedSkill, makeProject } from '../../helpers/skills-store.js'
import { mkdir } from 'fs/promises'
import { join } from 'path'

test.describe('Projects list', () => {
  test('WEB-PROJ-04: empty state renders', async ({ page }) => {
    await page.goto('/projects')
    await expect(page.getByText('No projects registered')).toBeVisible()
  })

  test('WEB-PROJ-01: register a valid absolute path via the form', async ({ page, server }) => {
    const dir = join(server.home, 'projects', 'ui-added')
    await mkdir(join(dir, '.claude'), { recursive: true })

    await page.goto('/projects')
    await page.getByRole('button', { name: 'Add Project' }).click()
    await page.getByPlaceholder('/absolute/path/to/project').fill(dir)
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(page.getByRole('link', { name: 'ui-added' })).toBeVisible()
    await expect(page.getByText('claude-code')).toBeVisible() // auto-detected agent shown
  })

  test('UX-005/F-WEB-02: invalid path surfaces the server validation message', async ({ page }) => {
    await page.goto('/projects')
    await page.getByRole('button', { name: 'Add Project' }).click()
    const input = page.getByPlaceholder('/absolute/path/to/project')
    await input.fill('./relative/path')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(input).toBeVisible()
    await expect(input).toHaveValue('./relative/path')
    await expect(page.getByRole('alert')).toContainText(/absolute|exist/i)
  })

  test('UX-004/F-WEB-01: project Remove asks for confirmation', async ({ page, server }) => {
    await makeProject(server.home, 'rm-proj', { agentDirs: ['.claude'] })
    await page.goto('/projects')

    let deleteFired = false
    page.on('request', req => {
      if (req.method() === 'DELETE' && req.url().includes('/api/projects/')) deleteFired = true
    })
    let dialogShown = false
    page.once('dialog', async dialog => {
      dialogShown = true
      expect(dialog.type()).toBe('confirm')
      expect(deleteFired).toBe(false)
      await dialog.accept()
    })

    await page.getByRole('button', { name: 'Remove' }).first().click()
    await expect(page.getByText('No projects registered')).toBeVisible()
    expect(dialogShown).toBe(true)
    expect(deleteFired).toBe(true)
  })

  test('UX-007/F-WEB-04: project form supports autofocus, Escape and Enter', async ({ page, server }) => {
    const dir = join(server.home, 'projects', 'keyboard-added')
    await mkdir(dir, { recursive: true })
    await page.goto('/projects')
    await page.getByRole('button', { name: 'Add Project' }).click()
    const input = page.getByPlaceholder('/absolute/path/to/project')
    await expect(input).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(input).toBeHidden()
    await page.getByRole('button', { name: 'Add Project' }).click()
    await page.getByPlaceholder('/absolute/path/to/project').fill(dir)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('link', { name: 'keyboard-added' })).toBeVisible()
  })
})

test.describe('Project Detail', () => {
  test('project header, path and bulk buttons render', async ({ page, server }) => {
    const dir = await makeProject(server.home, 'detail-p', { agentDirs: ['.claude'] })
    await page.goto(`/projects/${encodeURIComponent(dir)}`)
    await expect(page.getByRole('heading', { name: 'detail-p' })).toBeVisible()
    await expect(page.getByText(dir)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enable all' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Disable all' })).toBeVisible()
  })

  test('matrix toggle round-trip persists through refetch (on whatever rows exist)', async ({ page, server }) => {
    await seedSkill(server.home, 'basic-skill')
    const dir = await makeProject(server.home, 'toggle-p', { agentDirs: ['.claude'] })
    await page.goto(`/projects/${encodeURIComponent(dir)}`)

    // BUG-001 note: row names may be mangled, but the toggle→API→refetch loop is
    // still a real round-trip against the server for whatever key the row carries.
    const disable = page.getByTitle('Disable for claude-code').first()
    await expect(disable).toBeVisible()
    await disable.click()
    await expect(page.getByTitle('Enable for claude-code').first()).toBeVisible()
  })

  test('WEB-PROJDETAIL-01b: matrix lists the seeded skill by its clean name (BUG-001 fixed)', async ({ page, server }) => {
    await seedSkill(server.home, 'basic-skill')
    const dir = await makeProject(server.home, 'named-p', { agentDirs: ['.claude'] })
    await page.goto(`/projects/${encodeURIComponent(dir)}`)
    await expect(page.getByRole('link', { name: 'basic-skill', exact: true })).toBeVisible()
  })

  test('WEB-PROJDETAIL-04: empty global store shows "No skills installed globally." (BUG-001 fixed)', async ({ page, server }) => {
    const dir = await makeProject(server.home, 'empty-p', { agentDirs: ['.claude'] })
    await page.goto(`/projects/${encodeURIComponent(dir)}`)
    await expect(page.getByText('No skills installed globally.')).toBeVisible()
  })

  test.fixme('UX-010/F-WEB-09: bulk actions must show progress and partial-failure feedback', async ({ page, server }) => {
    await seedSkill(server.home, 'basic-skill')
    const dir = await makeProject(server.home, 'bulk-p', { agentDirs: ['.claude'] })
    await page.route('**/api/skills/**/disable', route => route.fulfill({ status: 500, body: '{"error":"x"}' }))
    await page.goto(`/projects/${encodeURIComponent(dir)}`)
    await page.getByRole('button', { name: 'Disable all' }).click()
    // DESIRED: user is told some ops failed. ACTUAL today: silent refetch.
    await expect(page.getByText(/fail|error/i)).toBeVisible()
  })

  test('UX-009/F-WEB-07: a failed toggle must surface an error, not silently revert', async ({ page, server }) => {
    await seedSkill(server.home, 'basic-skill')
    const dir = await makeProject(server.home, 'errtoggle-p', { agentDirs: ['.claude'] })
    await page.route('**/api/skills/**/disable', route => route.fulfill({ status: 500, body: '{"error":"x"}' }))
    await page.goto(`/projects/${encodeURIComponent(dir)}`)
    await page.getByTitle('Disable for claude-code').first().click()
    await expect(page.getByRole('alert')).toContainText(/fail|error/i)
  })
})
