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
