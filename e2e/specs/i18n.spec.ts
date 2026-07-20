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
