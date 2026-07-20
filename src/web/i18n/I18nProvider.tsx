import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  detectLocale,
  formatLocaleDate,
  localizeKnownError,
  readStoredLocale,
  writeStoredLocale,
  type Locale,
} from './locale.js'
import { translate, type TranslationKey, type TranslationParams } from './translations.js'

interface I18nValue {
  locale: Locale
  setLocale(locale: Locale): void
  t(key: TranslationKey, params?: TranslationParams): string
  formatDate(value: string | number | Date): string
  localizeError(error: unknown, fallbackKey: TranslationKey): string
}

const I18nContext = createContext<I18nValue | undefined>(undefined)

function initialLocale(): Locale {
  const stored = readStoredLocale(window.localStorage)
  const languages = navigator.languages.length > 0 ? navigator.languages : [navigator.language]
  return detectLocale(stored, languages)
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(locale, key, params),
    [locale]
  )

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale)
    writeStoredLocale(window.localStorage, nextLocale)
  }, [])

  const formatDate = useCallback(
    (value: string | number | Date) => formatLocaleDate(locale, value),
    [locale]
  )

  const localizeError = useCallback((error: unknown, fallbackKey: TranslationKey) => {
    if (error instanceof Error && error.message) {
      return localizeKnownError(locale, error.message)
    }
    return translate(locale, fallbackKey)
  }, [locale])

  useEffect(() => {
    document.documentElement.lang = locale
    document.title = t('app.documentTitle')
  }, [locale, t])

  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale,
    t,
    formatDate,
    localizeError,
  }), [formatDate, locale, localizeError, setLocale, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used within I18nProvider')
  return value
}
