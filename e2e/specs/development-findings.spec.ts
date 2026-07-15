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

test('UX-007: Install new Skill explains global effects and supports keyboard control', async ({ page }) => {
  await routeSkillsList(page, [])
  await page.route('**/api/skills', route =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 422, contentType: 'application/json', body: '{"error":"Repository not found"}' })
      : route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )

  await page.goto('/skills')
  await page.getByRole('button', { name: 'Install new Skill' }).click()
  await expect(page.getByRole('dialog')).toContainText('adds its Skills to this catalog')
  await expect(page.getByRole('dialog')).toContainText('installs them globally')
  const input = page.getByLabel('Skill source')
  await expect(input).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(input).toBeHidden()

  await page.getByRole('button', { name: 'Install new Skill' }).click()
  await page.getByLabel('Skill source').fill('missing/repo')
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
  let postRequests = 0
  await page.route('**/api/agents', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '["codex"]',
  }))
  await page.route('**/api/projects', route =>
    route.request().method() === 'POST'
      ? (postRequests += 1, route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"path must be absolute"}' }))
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
  await expect(page.getByRole('alert')).toContainText('Enter an absolute project path.')
  expect(postRequests).toBe(0)
})

test('project registration returns to the requesting Skill detail', async ({ page }) => {
  await page.route('**/api/agents', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '["codex"]',
  }))
  await page.route('**/api/projects', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(project) })
    : route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )

  await page.goto('/projects?returnSkill=basic-skill-id')
  await page.getByRole('button', { name: 'Add Project' }).click()
  await page.getByPlaceholder('/absolute/path/to/project').fill(projectPath)
  await page.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page).toHaveURL(/\/skills\/basic-skill-id$/)
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

test('targeted install: a Skill is installed into a selected project without leaving detail', async ({ page }) => {
  let enableRequests = 0
  const projectSkill = {
    ...skill,
    instances: [],
    status: {
      [projectPath]: {
        codex: { state: 'available', canEnable: true, canDisable: false },
      },
    },
  }
  await page.route('**/api/projects', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([project]),
  }))
  await page.route('**/api/skills/basic-skill-id/maintenance', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      update: { supported: false, status: 'unsupported', checkedAt: '2026-07-15T00:00:00.000Z' },
      modifiedProjects: [],
    }),
  }))
  await page.route('**/api/skills/basic-skill-id/enable', route => {
    enableRequests += 1
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.route('**/api/skills/basic-skill-id', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(projectSkill),
  }))

  await page.goto('/skills/basic-skill-id')
  await page.getByRole('button', { name: 'Install basic-skill in app for codex' }).click()

  await expect(page).toHaveURL(/\/skills\/basic-skill-id$/)
  await expect(page.getByText('Installed basic-skill in app.')).toBeVisible()
  expect(enableRequests).toBe(1)
})

test('maintenance recovery reinstalls a modified project copy from Skill detail', async ({ page }) => {
  let requests = 0
  await page.route('**/api/projects', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([project]) }))
  await page.route('**/api/skills/basic-skill-id/maintenance', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      update: { supported: false, status: 'unsupported', checkedAt: '2026-07-15T00:00:00.000Z' },
      modifiedProjects: [{ projectPath, paths: [`${projectPath}/.agents/skills/basic-skill`] }],
    }),
  }))
  await page.route('**/api/skills/basic-skill-id/reinstall-project', route => {
    requests += 1
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.route('**/api/skills/basic-skill-id', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ...skill, status: { [projectPath]: {} } }),
  }))

  await page.goto('/skills/basic-skill-id')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Reinstall from source' }).click()
  await expect.poll(() => requests).toBe(1)
})

test('catalog-only Skill can be forgotten after confirmation', async ({ page }) => {
  await page.route('**/api/projects', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/skills/basic-skill-id/maintenance', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      update: { supported: false, status: 'unsupported', checkedAt: '2026-07-15T00:00:00.000Z' }, modifiedProjects: [],
    }),
  }))
  await page.route('**/api/skills/basic-skill-id/catalog', route => route.fulfill({ status: 204 }))
  await page.route('**/api/skills/basic-skill-id', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ...skill, instances: [], status: {} }),
  }))

  await page.goto('/skills/basic-skill-id')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Forget Skill' }).click()
  await expect(page).toHaveURL(/\/skills$/)
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
  let confirmed = false
  page.once('dialog', async dialog => {
    confirmed = true
    expect(dialog.message()).toContain('1 Skill')
    expect(dialog.message()).toContain('1 Agent target')
    expect(dialog.message()).toContain('Global installations are not removed')
    await dialog.accept()
  })

  await page.goto(`/projects/${encodeURIComponent(projectPath)}`)
  await page.getByRole('button', { name: 'Uninstall project installs' }).click()
  expect(confirmed).toBe(true)
  await expect(page.getByRole('button', { name: 'Uninstalling...' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Install all available' })).toBeDisabled()
  release()
  await expect(page.getByRole('alert')).toContainText('1 change failed')
})

test('UX-008: dashboard distinguishes API failure from loading', async ({ page }) => {
  await page.route('**/api/overview', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: '{"error":"down"}',
  }))
  await page.goto('/')
  await expect(page.getByText(/failed|attention/i)).toBeVisible()
})

test('first-run dashboard explains setup and Scan now refreshes product counts', async ({ page }) => {
  const empty = {
    generatedAt: '2026-07-15T00:00:00.000Z', knownSkills: 0, skillsInstalledGlobally: 0,
    skillsInstalledInProjects: 0, catalogOnlySkills: 0, registeredProjects: 0,
    modifiedProjectCopies: 0, updateAvailableSkills: 0, sourceMissingSkills: 0, missingProjects: [],
  }
  await page.route('**/api/overview/reconcile', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ...empty, generatedAt: '2026-07-15T01:00:00.000Z', knownSkills: 1 }),
  }))
  await page.route('**/api/overview', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(empty),
  }))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Set up skills-ui' })).toBeVisible()
  await expect(page.getByText('Register a project.')).toBeVisible()
  await page.getByRole('button', { name: 'Scan now' }).click()
  await expect(page.getByText('Known Skills').locator('..').getByText('1')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Set up skills-ui' })).toBeHidden()
})
