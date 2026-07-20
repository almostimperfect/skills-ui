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
