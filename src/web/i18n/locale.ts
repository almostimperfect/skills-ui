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
  'No reinstall source is available for this skill.': '该 Skill 没有可用于重新安装的来源。',
  'No managed global installation exists for this skill.': '该 Skill 没有受管的全局安装。',
  'This global skill is not tracked in .skill-lock.json.': '该全局 Skill 未记录在 .skill-lock.json 中。',
  'Could not fetch the latest version hash from GitHub.': '无法从 GitHub 获取最新版本哈希。',
}

const knownChinesePrefixes: Array<[string, string]> = [
  ['This skill does not have a reinstall source', '该 Skill 没有可用于重新安装的来源。'],
  ['Inherited from a global installation.', '该 Skill 继承自全局安装。请先处理全局安装，再创建项目副本。'],
]

const knownChinesePatterns: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [
    /^Visible through the shared \.agents\/skills directory because (.+) is installed in this project\.$/,
    match => `通过共享的 .agents/skills 目录可见，因为此项目已为 ${match[1]} 安装。`,
  ],
  [
    /^Managed as a shared project-local install for (.+)\.$/,
    match => `作为 ${match[1].replace(' and ', ' 和 ')} 的共享项目安装进行管理。`,
  ],
  [
    /^Enabling installs into the shared \.agents\/skills directory for (.+)\.$/,
    match => `启用后会安装到 ${match[1].replace(' and ', ' 和 ')} 共用的 .agents/skills 目录。`,
  ],
  [
    /^Project-local installs also create a canonical \.agents\/skills copy that may be visible to (.+)\.$/,
    match => `项目安装还会创建标准 .agents/skills 副本，${match[1].replace(' and ', ' 和 ')} 可能也能看到。`,
  ],
]

export function localizeKnownError(locale: Locale, message: string): string {
  if (locale === 'en') return message
  const exact = knownChineseErrors[message]
  if (exact) return exact
  for (const [pattern, replacement] of knownChinesePatterns) {
    const match = message.match(pattern)
    if (match) return replacement(match)
  }
  return knownChinesePrefixes.find(([prefix]) => message.startsWith(prefix))?.[1] ?? message
}
