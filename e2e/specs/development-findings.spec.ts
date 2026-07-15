import { expect, test } from '@playwright/test'

const skill = {
  id: 'basic-skill-id',
  name: 'basic-skill',
  description: 'A fixture skill',
  source: 'owner/repo',
  reinstallable: true,
  instances: [{ scope: 'global', path: '/tmp/e2e/global/basic-skill', agents: ['Codex'] }],
}

const projectPath = '/tmp/e2e/projects/app'
const project = { path: projectPath, name: 'app', agents: ['codex'] }

async function routeSkillsList(page: import('@playwright/test').Page, skills = [skill]) {
  await page.route('**/api/skills', route =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(skills) })
      : route.continue()
  )
  await page.route('**/api/agents/global', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ supported: ['codex'], enabled: ['codex'] }),
  }))
}

test('UX-005/006: failed global uninstall shows the server message after confirmation', async ({ page }) => {
  await routeSkillsList(page)
  await page.route('**/api/skills/basic-skill-id', route =>
    route.request().method() === 'DELETE'
      ? route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"Cannot remove this asset"}' })
      : route.continue()
  )
  let confirmed = false
  page.once('dialog', async dialog => {
    confirmed = true
    await dialog.accept()
  })

  await page.goto('/skills')
  await page.getByRole('button', { name: 'Uninstall Global' }).click()
  await expect(page.getByRole('alert')).toContainText('Cannot remove this asset')
  expect(confirmed).toBe(true)
})

test('UX-007: Add Asset supports autofocus, Escape, Enter and human-readable errors', async ({ page }) => {
  await routeSkillsList(page, [])
  await page.route('**/api/skills', route =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 422, contentType: 'application/json', body: '{"error":"Repository not found"}' })
      : route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )

  await page.goto('/skills')
  await page.getByRole('button', { name: 'Add Asset' }).click()
  const input = page.getByPlaceholder('owner/repo, GitHub URL, or local path')
  await expect(input).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(input).toBeHidden()

  await page.getByRole('button', { name: 'Add Asset' }).click()
  await page.getByPlaceholder('owner/repo, GitHub URL, or local path').fill('missing/repo')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alert')).toContainText('Repository not found')
  await expect(page.getByRole('alert')).not.toContainText('422')
})

test('UX-004/005: project removal confirms and reports a failed DELETE', async ({ page }) => {
  await page.route('**/api/agents', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '["codex"]',
  }))
  await page.route('**/api/projects', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([project]),
  }))
  await page.route('**/api/projects/**', route =>
    route.request().method() === 'DELETE'
      ? route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"Project is busy"}' })
      : route.continue()
  )
  let confirmed = false
  page.once('dialog', async dialog => {
    confirmed = true
    await dialog.accept()
  })

  await page.goto('/projects')
  await page.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByRole('alert')).toContainText('Project is busy')
  expect(confirmed).toBe(true)
})

test('UX-005/007: Add Project supports keyboard control and visible validation errors', async ({ page }) => {
  await page.route('**/api/agents', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '["codex"]',
  }))
  await page.route('**/api/projects', route =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"path must be absolute"}' })
      : route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )

  await page.goto('/projects')
  await page.getByRole('button', { name: 'Add Project' }).click()
  const input = page.getByPlaceholder('/absolute/path/to/project')
  await expect(input).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(input).toBeHidden()

  await page.getByRole('button', { name: 'Add Project' }).click()
  await page.getByPlaceholder('/absolute/path/to/project').fill('./relative')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alert')).toContainText('path must be absolute')
})

test('UX-001: an unknown asset renders a not-found state', async ({ page }) => {
  await page.route('**/api/skills/ghost**', route => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: '{"error":"Skill not found"}',
  }))
  await page.goto('/skills/ghost')
  await expect(page.getByText('Skill not found', { exact: true })).toBeVisible()
})

test('catalog continuity: an alias detail URL is replaced with the canonical Skill id', async ({ page }) => {
  const canonicalSkill = {
    ...skill,
    id: 'canonical-id',
    aliases: ['old-id'],
    status: {},
  }
  await page.route('**/api/skills/*/maintenance', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      update: { supported: false, status: 'unsupported', checkedAt: '2026-07-15T00:00:00.000Z' },
      modifiedProjects: [],
    }),
  }))
  await page.route('**/api/skills/*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(canonicalSkill),
  }))

  await page.goto('/skills/old-id')

  await expect(page).toHaveURL(/\/skills\/canonical-id$/)
  await expect(page.getByRole('heading', { name: 'basic-skill' })).toBeVisible()
})

test('project Skill state is inert and removal is an explicit confirmed action', async ({ page }) => {
  let disableRequests = 0
  await page.route('**/api/projects/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ...project,
      skills: [{
        ...skill,
        instances: [{ scope: 'project', path: `${projectPath}/.agents/skills/basic-skill`, agents: ['Codex', 'Gemini CLI'] }],
        status: {
          codex: {
            state: 'project',
            canEnable: false,
            canDisable: true,
            sharedWith: ['gemini-cli'],
          },
        },
      }],
    }),
  }))
  await page.route('**/api/skills/basic-skill-id/disable', route => {
    disableRequests += 1
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })

  await page.goto(`/projects/${encodeURIComponent(projectPath)}`)
  await page.locator('tbody').getByText('Project install', { exact: true }).click()
  await page.waitForTimeout(200)
  expect(disableRequests).toBe(0)

  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('basic-skill')
    expect(dialog.message()).toContain('app')
    expect(dialog.message()).toContain('codex')
    expect(dialog.message()).toContain('gemini-cli')
    expect(dialog.message()).toContain('catalog')
    await dialog.dismiss()
  })
  await page.getByRole('button', { name: 'Remove from project' }).click()
  expect(disableRequests).toBe(0)

  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Remove from project' }).click()
  await expect.poll(() => disableRequests).toBe(1)
})

test('UX-009: a failed explicit project removal renders feedback', async ({ page }) => {
  await page.route('**/api/projects/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ...project,
      skills: [{
        ...skill,
        instances: [{ scope: 'project', path: `${projectPath}/.agents/skills/basic-skill`, agents: ['Codex'] }],
        status: { codex: { state: 'project', canEnable: false, canDisable: true } },
      }],
    }),
  }))
  await page.route('**/api/skills/basic-skill-id/disable', route => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: '{"error":"disk failure"}',
  }))

  await page.goto(`/projects/${encodeURIComponent(projectPath)}`)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Remove from project' }).click()
  await expect(page.getByRole('alert')).toContainText(/failed|disk failure/i)
})

test('UX-010: bulk uninstall shows progress and partial failure count', async ({ page }) => {
  await page.route('**/api/projects/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ...project,
      skills: [{
        ...skill,
        status: { codex: { state: 'project', canEnable: false, canDisable: true } },
      }],
    }),
  }))
  let release!: () => void
  const released = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/skills/basic-skill-id/disable', async route => {
    await released
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"disk failure"}' })
  })

  await page.goto(`/projects/${encodeURIComponent(projectPath)}`)
  await page.getByRole('button', { name: 'Uninstall project installs' }).click()
  await expect(page.getByRole('button', { name: 'Uninstalling...' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Install all available' })).toBeDisabled()
  release()
  await expect(page.getByRole('alert')).toContainText('1 change failed')
})

test('UX-008: dashboard distinguishes API failure from loading', async ({ page }) => {
  await page.route('**/api/skills', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: '{"error":"down"}',
  }))
  await page.route('**/api/projects', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }))
  await page.goto('/')
  await expect(page.getByText(/failed|attention/i)).toBeVisible()
})
