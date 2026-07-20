import type { Locale } from './locale.js'

export type TranslationParams = Record<string, string | number>

export const en = {
  'app.title': 'skills-ui',
  'app.subtitle': 'Local Skill assets',
  'nav.dashboard': 'Dashboard',
  'nav.skills': 'Skills',
  'nav.projects': 'Projects',
  'language.label': 'Interface language',
  'language.zh': '中文',
  'language.en': 'English',
  'skill.installProjectSuccess': 'Installed {skill} in {project}.',
  'error.skillNotFound': 'Skill not found',
  'error.projectNotFound': 'Project not found',
  'error.absolutePath': 'Enter an absolute project path.',
} as const

export type TranslationKey = keyof typeof en
type Dictionary = Record<TranslationKey, string>

export const zhCN = {
  'app.title': 'skills-ui',
  'app.subtitle': '本机 Skill 资产',
  'nav.dashboard': '概览',
  'nav.skills': 'Skills',
  'nav.projects': '项目',
  'language.label': '界面语言',
  'language.zh': '中文',
  'language.en': 'English',
  'skill.installProjectSuccess': '已将 {skill} 安装到 {project}。',
  'error.skillNotFound': '未找到 Skill',
  'error.projectNotFound': '未找到项目',
  'error.absolutePath': '请输入项目的绝对路径。',
} satisfies Dictionary

const dictionaries: Record<Locale, Dictionary> = { en, 'zh-CN': zhCN }

export function translate(
  locale: Locale,
  key: TranslationKey,
  params: TranslationParams = {}
): string {
  return dictionaries[locale][key].replace(
    /\{(\w+)\}/g,
    (_, name: string) => String(params[name] ?? `{${name}}`)
  )
}
