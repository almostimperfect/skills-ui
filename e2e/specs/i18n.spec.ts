import { expect, test } from '@playwright/test'

test.use({ locale: 'zh-CN' })

test('first visit follows browser language and remembers a manual switch', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('link', { name: '概览' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')

  await page.getByRole('button', { name: '切换界面语言为 English' }).click()
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await page.reload()
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('Chinese catalog localizes controls and known API errors', async ({ page }) => {
  await page.route('**/api/agents/global', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ supported: ['codex'], enabled: ['codex'] }),
  }))
  await page.route('**/api/skills', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Skill not found"}' })
    : route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )

  await page.goto('/skills')
  await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible()
  await expect(page.getByRole('button', { name: '安装新 Skill' })).toBeVisible()
  await expect(page.getByPlaceholder('搜索 Skill、描述或来源…')).toBeVisible()

  await page.getByRole('button', { name: '安装新 Skill' }).click()
  await page.getByLabel('Skill 来源').fill('missing/repo')
  await page.getByRole('button', { name: '安装', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('未找到 Skill')
})

test('Chinese interface preserves an unknown safe API diagnostic', async ({ page }) => {
  await page.route('**/api/agents/global', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ supported: ['codex'], enabled: ['codex'] }),
  }))
  await page.route('**/api/skills', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 422, contentType: 'application/json', body: '{"error":"Custom safe diagnostic"}' })
    : route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  )

  await page.goto('/skills')
  await page.getByRole('button', { name: '安装新 Skill' }).click()
  await page.getByLabel('Skill 来源').fill('missing/repo')
  await page.getByRole('button', { name: '安装', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Custom safe diagnostic')
})

test('Chinese project registration localizes controls and validation', async ({ page }) => {
  await page.route('**/api/agents', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '["codex"]',
  }))
  await page.route('**/api/projects', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }))

  await page.goto('/projects')
  await page.getByRole('button', { name: '添加项目' }).click()
  await expect(page.getByLabel('项目路径')).toBeFocused()
  await page.getByLabel('项目路径').fill('./relative')
  await page.getByRole('button', { name: '添加', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('请输入项目的绝对路径。')
})

test('Chinese bulk uninstall confirmation explains complete impact', async ({ page }) => {
  const projectPath = '/tmp/e2e/projects/app'
  await page.route('**/api/projects/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      path: projectPath,
      name: 'app',
      agents: ['codex'],
      skills: [{
        id: 'basic-skill-id',
        name: 'basic-skill',
        description: 'A fixture Skill',
        instances: [],
        status: { codex: { state: 'project', canEnable: false, canDisable: true } },
      }],
    }),
  }))

  await page.goto(`/projects/${encodeURIComponent(projectPath)}`)
  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('从 app 卸载 1 个 Skill 的项目安装')
    expect(dialog.message()).toContain('1 个 Agent 目标')
    expect(dialog.message()).toContain('不会移除全局安装')
    expect(dialog.message()).toContain('Skills 仍保留在目录中')
    await dialog.dismiss()
  })
  await page.getByRole('button', { name: '卸载项目安装' }).click()
})

test('Chinese Skill detail localizes global split impact', async ({ page }) => {
  const projectPath = '/tmp/e2e/projects/app'
  const project = { path: projectPath, name: 'app', agents: ['codex'] }
  const skill = {
    id: 'basic-skill-id',
    name: 'basic-skill',
    description: 'A fixture Skill',
    source: 'owner/repo',
    reinstallable: true,
    instances: [{ scope: 'global', path: '/tmp/e2e/global/basic-skill', agents: ['Codex'] }],
    status: { [projectPath]: { codex: { state: 'global', canEnable: false, canDisable: false } } },
  }
  await page.route('**/api/projects', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([project]),
  }))
  await page.route('**/api/skills/basic-skill-id/maintenance', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      update: { supported: false, status: 'unsupported', checkedAt: '2026-07-19T00:00:00.000Z' },
      modifiedProjects: [],
    }),
  }))
  await page.route('**/api/skills/basic-skill-id', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(skill),
  }))

  await page.goto('/skills/basic-skill-id')
  await expect(page.getByRole('link', { name: '← 返回 Skills' })).toBeVisible()
  await expect(page.getByText('全局安装', { exact: true }).first()).toBeVisible()

  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('将 basic-skill 拆分为项目副本')
    expect(dialog.message()).toContain('app (codex)')
    expect(dialog.message()).toContain('会移除全局安装')
    await dialog.dismiss()
  })
  await page.getByRole('button', { name: '将全局安装拆分到项目' }).click()
})

test('Chinese targeted install keeps Skill and project names unchanged', async ({ page }) => {
  const projectPath = '/tmp/e2e/projects/app'
  const project = { path: projectPath, name: 'app', agents: ['codex'] }
  let installed = false
  const baseSkill = {
    id: 'basic-skill-id',
    name: 'basic-skill',
    description: 'A fixture Skill',
    source: 'owner/repo',
    reinstallable: true,
    instances: [],
    status: { [projectPath]: { codex: { state: 'available', canEnable: true, canDisable: false } } },
  }
  await page.route('**/api/projects', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify([project]),
  }))
  await page.route('**/api/skills/basic-skill-id/maintenance', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      update: { supported: false, status: 'unsupported', checkedAt: '2026-07-19T00:00:00.000Z' },
      modifiedProjects: [],
    }),
  }))
  await page.route('**/api/skills/basic-skill-id/enable', route => {
    installed = true
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.route('**/api/skills/basic-skill-id', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(installed ? {
      ...baseSkill,
      instances: [{ scope: 'project', path: `${projectPath}/.agents/skills/basic-skill`, agents: ['Codex'], projectPath }],
      status: { [projectPath]: { codex: { state: 'project', canEnable: false, canDisable: true } } },
    } : baseSkill),
  }))

  await page.goto('/skills/basic-skill-id')
  await page.getByRole('button', { name: '将 basic-skill 安装到 app（codex）' }).click()
  await expect(page.getByRole('status')).toContainText('已将 basic-skill 安装到 app。')
  await expect(page.getByText('已安装到此项目。')).toBeVisible()
})
