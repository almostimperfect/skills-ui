# Bilingual Interface Implementation Plan v1.0

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete English/Simplified Chinese interface with browser-language detection, persistent language switching, localized known errors, and no changes to Skill data or server APIs.

**Architecture:** Add a dependency-free, typed i18n layer under `src/web/i18n/`. Pure locale and translation functions are unit-tested; a React provider owns the active locale and synchronizes local storage, `<html lang>`, and the document title. Existing pages and components consume one `useI18n()` API, while Playwright verifies the user-visible language flow and protects the existing English behavior.

**Tech Stack:** TypeScript, React 19, React Context, Vite, Vitest, Playwright, Docker.

## Global Constraints

- Supported locales are exactly `en` and `zh-CN`.
- First visit follows browser language; a valid saved preference in `skills-ui.locale` wins.
- Keep `Skill`, Skill names, Agent names, paths, repository addresses, commands, filenames, and API values untranslated.
- Known safe API errors are localized; unknown safe server messages remain unchanged.
- Switching language must not reload the page or reset the current route, filters, loaded data, or form content.
- Do not add a runtime dependency and do not change server APIs, persistence, or installation behavior.
- All production behavior changes use test-first red-green-refactor cycles.
- All document outputs remain versioned; do not overwrite the v1.0 design or plan.

---

## File Structure

**Create**

- `src/web/i18n/locale.ts` — locale detection, safe persistence, interpolation, date formatting.
- `src/web/i18n/translations.ts` — English source dictionary, complete Simplified Chinese dictionary, typed translation keys.
- `src/web/i18n/I18nProvider.tsx` — context, `t`, `formatDate`, `localizeError`, and `setLocale`.
- `tests/web/i18n.test.ts` — pure unit coverage for detection, interpolation, and error fallback.
- `e2e/specs/i18n.spec.ts` — browser-level Chinese detection, switching, persistence, prompts, and error behavior.

**Modify**

- `src/web/main.tsx` — mount `I18nProvider` around the routed application.
- `src/web/components/Layout.tsx` — localized navigation and language switcher.
- `src/web/components/AddSkillDialog.tsx` — localized dialog, fields, progress, and errors.
- `src/web/components/AgentSkillControl.tsx` — localized states, actions, confirmations, and errors.
- `src/web/components/InstallProjectPanel.tsx` — localized project targeting and results.
- `src/web/pages/Dashboard.tsx` — localized health overview, setup steps, and date.
- `src/web/pages/Skills.tsx` — localized catalog, filters, statuses, targets, actions, and feedback.
- `src/web/pages/Projects.tsx` — localized registration, validation, actions, and empty state.
- `src/web/pages/ProjectDetail.tsx` — localized matrix, bulk summaries, and confirmations.
- `src/web/pages/SkillDetail.tsx` — localized detail, maintenance, recovery, confirmations, and matrix.
- `e2e/specs/development-findings.spec.ts` — force the existing regression suite to English.

---

### Task 1: Pure Locale and Translation Core

**Files:**

- Create: `tests/web/i18n.test.ts`
- Create: `src/web/i18n/locale.ts`
- Create: `src/web/i18n/translations.ts`

**Interfaces:**

- Produces: `type Locale = 'en' | 'zh-CN'`
- Produces: `const LOCALE_STORAGE_KEY = 'skills-ui.locale'`
- Produces: `detectLocale(saved: unknown, languages: readonly string[]): Locale`
- Produces: `translate(locale: Locale, key: TranslationKey, params?: TranslationParams): string`
- Produces: `formatLocaleDate(locale: Locale, value: string | number | Date): string`
- Produces: `localizeKnownError(locale: Locale, message: string): string`

- [ ] **Step 1: Write failing pure-function tests**

Create `tests/web/i18n.test.ts` with these exact behaviors:

```ts
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
```

- [ ] **Step 2: Run the new unit test and verify RED**

Run:

```bash
docker build -f Dockerfile.test -t skills-ui-i18n-unit-red .
docker run --rm skills-ui-i18n-unit-red npm test -- tests/web/i18n.test.ts
```

Expected: FAIL because `src/web/i18n/locale.ts` and `translations.ts` do not exist.

- [ ] **Step 3: Implement locale primitives**

Create `src/web/i18n/locale.ts` around these exact signatures and rules:

```ts
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
    // The current session still changes language when storage is blocked.
  }
}

export function formatLocaleDate(locale: Locale, value: string | number | Date): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value))
}
```

Add an exact-match known-error table for `Skill not found`, `Project not found`, `path must be absolute`, `Remove every installation before forgetting this Skill.`, and stable prefix handlers for reinstall-source and global-inheritance errors. Return the original message when no mapping matches or when locale is `en`.

- [ ] **Step 4: Implement typed dictionaries and interpolation**

Create `src/web/i18n/translations.ts` with:

```ts
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

export function translate(locale: Locale, key: TranslationKey, params: TranslationParams = {}): string {
  return dictionaries[locale][key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
}
```

Expand both dictionaries in later tasks; every new key must be added to both languages in the same test-first change.

- [ ] **Step 5: Rebuild and verify GREEN**

Run the same Docker build and focused test. Expected: `tests/web/i18n.test.ts` passes with no warnings.

- [ ] **Step 6: Commit the core**

```bash
git add src/web/i18n/locale.ts src/web/i18n/translations.ts tests/web/i18n.test.ts
git commit -m "feat: add typed locale core"
```

---

### Task 2: React Provider and Persistent Language Switcher

**Files:**

- Create: `src/web/i18n/I18nProvider.tsx`
- Modify: `src/web/main.tsx`
- Modify: `src/web/components/Layout.tsx`
- Create: `e2e/specs/i18n.spec.ts`
- Modify: `e2e/specs/development-findings.spec.ts`
- Modify: `src/web/i18n/translations.ts`

**Interfaces:**

- Consumes: Task 1 locale and translation functions.
- Produces: `useI18n(): { locale; setLocale; t; formatDate; localizeError }`.

- [ ] **Step 1: Add failing browser tests for detection, switching, and persistence**

Create `e2e/specs/i18n.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test.use({ locale: 'zh-CN' })

test('first visit follows browser language and remembers a manual switch', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: '概览' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')

  await page.getByRole('button', { name: 'Switch interface language to English' }).click()
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.reload()
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
})
```

At the top of `development-findings.spec.ts`, add:

```ts
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('skills-ui.locale', 'en'))
})
```

- [ ] **Step 2: Build and run the focused E2E test to verify RED**

Run:

```bash
docker build -f Dockerfile.e2e -t skills-ui-i18n-e2e-red .
docker run --rm skills-ui-i18n-e2e-red npx playwright test --config e2e/playwright.config.ts e2e/specs/i18n.spec.ts
```

Expected: FAIL because the Chinese navigation and switcher do not exist.

- [ ] **Step 3: Implement `I18nProvider`**

Use a context with this public value:

```ts
interface I18nValue {
  locale: Locale
  setLocale(locale: Locale): void
  t(key: TranslationKey, params?: TranslationParams): string
  formatDate(value: string | number | Date): string
  localizeError(error: unknown, fallbackKey: TranslationKey): string
}
```

Initialize state from `readStoredLocale(window.localStorage)` and `detectLocale(saved, navigator.languages.length ? navigator.languages : [navigator.language])`. On locale change, update storage, `document.documentElement.lang`, and `document.title = t('app.documentTitle')`. `localizeError` must use an `Error` message when present, call `localizeKnownError`, and otherwise return the translated fallback.

- [ ] **Step 4: Mount the provider and add the switcher**

Wrap `BrowserRouter` with `I18nProvider` in `main.tsx`. In `Layout.tsx`, move navigation labels into translation keys and add a side-footer language group:

```tsx
<div className="border-t border-slate-200 p-3" aria-label={t('language.label')}>
  <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
    {(['zh-CN', 'en'] as const).map(option => (
      <button
        key={option}
        type="button"
        aria-pressed={locale === option}
        aria-label={option === 'en' ? t('language.switchToEnglish') : t('language.switchToChinese')}
        onClick={() => setLocale(option)}
        className={locale === option ? 'rounded-md bg-white px-2 py-1.5 text-xs font-medium text-slate-950 shadow-sm' : 'rounded-md px-2 py-1.5 text-xs text-slate-500'}
      >
        {option === 'en' ? t('language.en') : t('language.zh')}
      </button>
    ))}
  </div>
</div>
```

For narrow layout, keep this footer in normal aside flow; for desktop, use `md:mt-auto` so it stays at the bottom.

- [ ] **Step 5: Rebuild and verify GREEN plus English regression smoke**

Run the focused i18n E2E and the existing `UX-007` English test. Expected: both pass.

- [ ] **Step 6: Commit provider and switcher**

```bash
git add src/web/i18n/I18nProvider.tsx src/web/i18n/translations.ts src/web/main.tsx src/web/components/Layout.tsx e2e/specs/i18n.spec.ts e2e/specs/development-findings.spec.ts
git commit -m "feat: add persistent language switcher"
```

---

### Task 3: Localize Dashboard, Catalog, and Install Dialog

**Files:**

- Modify: `e2e/specs/i18n.spec.ts`
- Modify: `src/web/i18n/translations.ts`
- Modify: `src/web/pages/Dashboard.tsx`
- Modify: `src/web/pages/Skills.tsx`
- Modify: `src/web/components/AddSkillDialog.tsx`

**Interfaces:**

- Consumes: `useI18n()` from Task 2.
- Produces: fully localized overview and catalog flows.

- [ ] **Step 1: Add failing Chinese catalog and known/unknown error tests**

Extend `i18n.spec.ts` to assert:

```ts
await page.goto('/skills')
await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible()
await expect(page.getByRole('button', { name: '安装新 Skill' })).toBeVisible()
await expect(page.getByPlaceholder('搜索 Skill、描述或来源…')).toBeVisible()
```

Route a POST `/api/skills` response with `{"error":"Skill not found"}` and expect `未找到 Skill`. In a separate submission return `{"error":"Custom safe diagnostic"}` and expect the original English diagnostic.

- [ ] **Step 2: Run focused E2E and verify RED**

Expected: Chinese catalog labels and localized known errors are absent.

- [ ] **Step 3: Add the exact dictionary coverage**

Add paired keys for these groups:

- `dashboard.*`: eyebrow, title, last scanned, unavailable, scanning, scan action, five counts, four health items, health error, setup title and three steps, manage links.
- `skills.*`: eyebrow, title, catalog explanation, global target heading/help/error, search placeholder, four filters with `{count}`, loading/error/empty, four asset states, source states, install counts, reinstallability, details, install/uninstall labels, confirmation, title and success/error feedback.
- `addSkill.*`: dialog title, explanation, global effect, source label, placeholder, examples, cancel/install/installing, generic error.

Use `…` in Chinese placeholders and preserve `Skill` casing.

- [ ] **Step 4: Migrate Dashboard and date formatting**

Call `const { t, formatDate } = useI18n()`. Replace every fixed string and every module-level label array with translated values generated during render. Replace `toLocaleString()` with `formatDate(data.generatedAt)`. Add `role="alert"` to the health error if it is not already present.

- [ ] **Step 5: Migrate Skills and AddSkillDialog**

Move `getAssetState` labels and `sourceLabel` fixed states behind translation keys, while leaving actual paths and sources unchanged. Translate filter labels with `{count}`. Localize mutation errors through `localizeError(error, fallbackKey)`. Translate all confirmation and title attributes. In `AddSkillDialog`, localize the dialog accessible title, label, placeholder, examples, progress, and errors.

- [ ] **Step 6: Verify focused Chinese and existing English tests**

Expected: new Chinese catalog/error tests pass and all existing catalog regression tests remain green.

- [ ] **Step 7: Commit overview and catalog migration**

```bash
git add src/web/i18n/translations.ts src/web/pages/Dashboard.tsx src/web/pages/Skills.tsx src/web/components/AddSkillDialog.tsx e2e/specs/i18n.spec.ts
git commit -m "feat: localize overview and Skill catalog"
```

---

### Task 4: Localize Projects and Project Matrix

**Files:**

- Modify: `e2e/specs/i18n.spec.ts`
- Modify: `src/web/i18n/translations.ts`
- Modify: `src/web/pages/Projects.tsx`
- Modify: `src/web/pages/ProjectDetail.tsx`
- Modify: `src/web/components/AgentSkillControl.tsx`

**Interfaces:**

- Consumes: translation, error localization, and interpolation APIs.
- Produces: localized project registration, matrix, item actions, and batch summaries.

- [ ] **Step 1: Add failing Chinese project flow tests**

Test these user-visible behaviors:

```ts
await page.goto('/projects')
await page.getByRole('button', { name: '添加项目' }).click()
await expect(page.getByLabel('项目路径')).toBeFocused()
await page.getByLabel('项目路径').fill('./relative')
await page.getByRole('button', { name: '添加', exact: true }).click()
await expect(page.getByRole('alert')).toContainText('请输入项目的绝对路径。')
```

On a project detail fixture, click `卸载项目安装` and assert the dialog contains the project name, Skill count, Agent target count, the global-install preservation statement, and `Skills 仍保留在目录中`.

- [ ] **Step 2: Run the project i18n tests and verify RED**

Expected: controls still have English accessible names and prompts.

- [ ] **Step 3: Add paired project dictionary keys**

Cover `projects.*`, `projectDetail.*`, and `agentControl.*`: headings, add form, path safety help, progress, errors, remove confirmation, empty/loading states, return link, status glossary, bulk actions, success/partial-failure summaries, table headings, status labels, install/remove actions, shared-Agent impact, title text, and generic action errors.

Use complete count-aware sentences rather than English `plural()` concatenation. Required parameter names are `{skills}`, `{targets}`, `{project}`, `{failed}`, and `{succeeded}`.

- [ ] **Step 4: Migrate Projects**

Use `t` for all labels and `localizeError` for mutations. Keep `/absolute/path/to/project` unchanged because it is a technical example. The removal prompt must interpolate only the project name. Keep Agent IDs unchanged.

- [ ] **Step 5: Migrate ProjectDetail and AgentSkillControl**

Delete the English-only `plural()` helper. Generate complete translated bulk confirmation and result sentences. In `AgentSkillControl`, translate state labels, `aria-label`, title fragments, install/remove actions, shared-Agent list introduction, removal impact, and fallback error. Preserve Skill, project, and Agent values.

- [ ] **Step 6: Verify Chinese project tests and existing English regressions**

Run the i18n project tests plus `UX-004/005`, `UX-005/007`, `project Skill state`, and `UX-010`. Expected: all pass.

- [ ] **Step 7: Commit project migration**

```bash
git add src/web/i18n/translations.ts src/web/pages/Projects.tsx src/web/pages/ProjectDetail.tsx src/web/components/AgentSkillControl.tsx e2e/specs/i18n.spec.ts
git commit -m "feat: localize project management"
```

---

### Task 5: Localize Skill Detail, Targeted Install, and Maintenance

**Files:**

- Modify: `e2e/specs/i18n.spec.ts`
- Modify: `src/web/i18n/translations.ts`
- Modify: `src/web/pages/SkillDetail.tsx`
- Modify: `src/web/components/InstallProjectPanel.tsx`

**Interfaces:**

- Consumes: complete i18n context.
- Produces: localized detail, targeted install, recovery, forget, update, and split flows.

- [ ] **Step 1: Add failing Chinese detail and destructive-prompt tests**

Use the existing global-install detail fixture. Assert Chinese labels for back navigation, global/project install counts, reinstallability, project target state, maintenance, instances, and project matrix. Trigger `Split Global Into Projects` and assert the Chinese dialog contains the unchanged Skill name, `app (codex)`, and an explicit statement that the global installation will be removed.

Add a targeted-install fixture and assert the success message `已将 basic-skill 安装到 app。` and settled state `已安装到此项目。`.

- [ ] **Step 2: Run focused detail tests and verify RED**

Expected: fixed English detail text and prompts cause failures.

- [ ] **Step 3: Add paired detail dictionary coverage**

Cover `skillDetail.*` and `installProject.*`: loading/not-found/failure, back, eyebrow, source, global install/forget actions, counts, yes/no, project selector, register-project branch, inherited/global/project/no-target states, success/error, glossary, maintenance update states, modified copies, recovery prompts/actions, installed instances, table heading, split support/reason/action/error/confirmation, and catalog-preservation language.

- [ ] **Step 4: Migrate InstallProjectPanel**

Translate selector, help, no-project branch, installation button/aria-label, success, error, already-installed, inherited-global, and no-target messages. Keep selected project, Agent group, and Skill names interpolated and unchanged.

- [ ] **Step 5: Migrate SkillDetail**

Use `t`, `localizeError`, and translated complete prompts. Translate `instance.scope` through `global`/`project` labels rather than CSS capitalization. Replace every title, status, failure, and table heading. Keep source, instance paths, modified project names, and Agent values unchanged.

- [ ] **Step 6: Verify focused detail tests and all existing detail regressions**

Run i18n detail tests plus unknown Skill, alias continuity, targeted install, split global, maintenance recovery, and forget tests. Expected: all pass.

- [ ] **Step 7: Commit detail migration**

```bash
git add src/web/i18n/translations.ts src/web/pages/SkillDetail.tsx src/web/components/InstallProjectPanel.tsx e2e/specs/i18n.spec.ts
git commit -m "feat: localize Skill detail workflows"
```

---

### Task 6: Coverage Audit, Full Verification, and Delivery

**Files:**

- Modify only if verification finds an untranslated user-facing literal or test defect.
- Create: `docs/audits/bilingual-interface-acceptance-v1.0/report-v1.0.md`
- Create: `docs/audits/bilingual-interface-acceptance-v1.0/screenshots/*.png`

**Interfaces:**

- Consumes: all previous tasks.
- Produces: verified bilingual release evidence.

- [ ] **Step 1: Scan for untranslated user-facing literals**

Run targeted `rg` searches across `src/web/**/*.tsx` for JSX text, `window.confirm`, `placeholder`, `title`, and `aria-label`. Classify every remaining English string as one of: technical value intentionally preserved, dynamic source data, or missed translation. Add a failing E2E assertion before fixing any missed user-visible behavior.

- [ ] **Step 2: Run complete automated verification**

Run:

```bash
docker build -f Dockerfile.test -t skills-ui-bilingual-test .
docker run --rm skills-ui-bilingual-test
docker build -f Dockerfile.e2e -t skills-ui-bilingual-e2e .
docker run --rm skills-ui-bilingual-e2e
```

Expected: all Vitest files and all Playwright tests pass with zero failures; both Docker builds complete successfully, including TypeScript and Vite production builds.

- [ ] **Step 3: Perform desktop human acceptance**

In the in-app desktop browser, verify:

1. Fresh Chinese browser state opens in Chinese.
2. Dashboard, Skills, Skill detail, Projects, and project detail have no fixed English paragraphs.
3. Switching to English keeps the current route and loaded context.
4. Reload retains English; switching back retains Chinese.
5. At least one destructive confirmation is Chinese and includes the actual impact.
6. Known error is Chinese; unknown safe diagnostic stays unchanged.

Capture synthetic-data screenshots only. Do not expose host paths or secrets.

- [ ] **Step 4: Write versioned acceptance report**

Create `docs/audits/bilingual-interface-acceptance-v1.0/report-v1.0.md` with tested flows, exact test counts, screenshots, privacy statement, evidence limits, and any non-blocking follow-ups. Preserve all prior audit versions.

- [ ] **Step 5: Run final hygiene checks**

```bash
git diff --check
git status --short --branch
rg -n '/Users/|/home/|Bearer [A-Za-z0-9]|token[=:][^ ]+' src/web tests/web e2e/specs/i18n.spec.ts docs/audits/bilingual-interface-acceptance-v1.0
```

Expected: no whitespace errors, no unrelated files, and no host secrets or real paths.

- [ ] **Step 6: Commit acceptance evidence and push**

```bash
git add docs/audits/bilingual-interface-acceptance-v1.0
git commit -m "test: record bilingual interface acceptance v1.0"
git push origin development
```

Expected: local `development`, `origin/development`, and `HEAD` resolve to the same commit and the worktree is clean.
