import { NavLink, Outlet } from 'react-router-dom'
import { useI18n } from '../i18n/I18nProvider.js'

export default function Layout() {
  const { locale, setLocale, t } = useI18n()
  const navItems = [
    { to: '/', label: t('nav.dashboard'), exact: true },
    { to: '/skills', label: t('nav.skills') },
    { to: '/projects', label: t('nav.projects') },
  ]

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 md:flex md:h-screen">
      <aside className="border-b border-slate-200 bg-white md:flex md:w-60 md:flex-col md:border-b-0 md:border-r">
        <div className="px-4 py-4 md:border-b md:border-slate-200 md:px-5">
          <span className="text-base font-semibold tracking-tight text-slate-950">skills-ui</span>
          <p className="mt-1 hidden text-xs text-slate-500 md:block">{t('app.subtitle')}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:space-y-1 md:overflow-visible md:py-4">
          {navItems.map(({ to, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3 md:mt-auto" role="group" aria-label={t('language.label')}>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            {(['zh-CN', 'en'] as const).map(option => (
              <button
                key={option}
                type="button"
                aria-pressed={locale === option}
                aria-label={option === 'en' ? t('language.switchToEnglish') : t('language.switchToChinese')}
                onClick={() => setLocale(option)}
                className={locale === option
                  ? 'rounded-md bg-white px-2 py-1.5 text-xs font-medium text-slate-950 shadow-sm'
                  : 'rounded-md px-2 py-1.5 text-xs text-slate-500 hover:text-slate-950'}
              >
                {option === 'en' ? t('language.en') : t('language.zh')}
              </button>
            ))}
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
