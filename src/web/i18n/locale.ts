export type Locale = 'en' | 'zh-CN'

export const LOCALE_STORAGE_KEY = 'skills-ui.locale'

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'zh-CN'
}

export function detectLocale(saved: unknown, languages: readonly string[]): Locale {
  if (isLocale(saved)) return saved
  return languages.some(language => /^zh(?:-|$)/i.test(language)) ? 'zh-CN' : 'en'
}

export function readStoredLocale(storage: Pick<Storage, 'getItem'> | undefined): Locale | undefined {
  try {
    const value = storage?.getItem(LOCALE_STORAGE_KEY)
    return isLocale(value) ? value : undefined
  } catch {
    return undefined
  }
}

export function writeStoredLocale(storage: Pick<Storage, 'setItem'> | undefined, locale: Locale): void {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Keep the in-memory preference when browser storage is unavailable.
  }
}

export function formatLocaleDate(locale: Locale, value: string | number | Date): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))
}

const knownChineseErrors: Record<string, string> = {
  'Skill not found': '未找到 Skill',
  'Project not found': '未找到项目',
  'path must be absolute': '项目路径必须是绝对路径',
  'Remove every installation before forgetting this Skill.': '请先移除该 Skill 的全部安装，再将其从目录中忘记。',
}

const knownChinesePrefixes: Array<[string, string]> = [
  ['This skill does not have a reinstall source', '该 Skill 没有可用于重新安装的来源。'],
  ['Inherited from a global installation.', '该 Skill 继承自全局安装。请先处理全局安装，再创建项目副本。'],
]

export function localizeKnownError(locale: Locale, message: string): string {
  if (locale === 'en') return message
  const exact = knownChineseErrors[message]
  if (exact) return exact
  return knownChinesePrefixes.find(([prefix]) => message.startsWith(prefix))?.[1] ?? message
}
