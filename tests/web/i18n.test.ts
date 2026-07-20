import { describe, expect, test } from 'vitest'
import { detectLocale, formatLocaleDate, localizeKnownError } from '../../src/web/i18n/locale.js'
import { translate } from '../../src/web/i18n/translations.js'

describe('locale detection', () => {
  test('a valid saved locale wins over browser languages', () => {
    expect(detectLocale('en', ['zh-CN'])).toBe('en')
    expect(detectLocale('zh-CN', ['en-US'])).toBe('zh-CN')
  })

  test('Chinese browser languages select zh-CN and invalid saved values are ignored', () => {
    expect(detectLocale('fr', ['en-US', 'zh-Hans-CN'])).toBe('zh-CN')
    expect(detectLocale(undefined, ['en-US'])).toBe('en')
  })
})

describe('translation', () => {
  test('interpolates dynamic technical values without translating them', () => {
    expect(translate('zh-CN', 'skill.installProjectSuccess', { skill: 'repo-a', project: 'app' }))
      .toBe('已将 repo-a 安装到 app。')
    expect(translate('en', 'skill.installProjectSuccess', { skill: 'repo-a', project: 'app' }))
      .toBe('Installed repo-a in app.')
  })

  test('formats dates for the active locale', () => {
    const value = new Date('2026-07-19T12:00:00.000Z')
    expect(formatLocaleDate('en', value)).not.toBe(formatLocaleDate('zh-CN', value))
  })
})

describe('known error localization', () => {
  test('localizes known errors and preserves unknown safe messages', () => {
    expect(localizeKnownError('zh-CN', 'Skill not found')).toBe('未找到 Skill')
    expect(localizeKnownError('zh-CN', 'Custom safe diagnostic')).toBe('Custom safe diagnostic')
    expect(localizeKnownError('en', 'Skill not found')).toBe('Skill not found')
  })
})
