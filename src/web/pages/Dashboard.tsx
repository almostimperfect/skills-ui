import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getOverview, reconcileOverview } from '../api.js'
import { useI18n } from '../i18n/I18nProvider.js'

export default function Dashboard() {
  const { formatDate, t } = useI18n()
  const qc = useQueryClient()
  const overview = useQuery({ queryKey: ['overview'], queryFn: getOverview })
  const scan = useMutation({
    mutationFn: reconcileOverview,
    onSuccess: data => {
      qc.setQueryData(['overview'], data)
      qc.invalidateQueries({ queryKey: ['skills'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
  const data = overview.data

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('dashboard.eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{t('dashboard.title')}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>{t('dashboard.lastScanned', { date: data ? formatDate(data.generatedAt) : t('dashboard.notAvailable') })}</span>
          <button onClick={() => scan.mutate()} disabled={scan.isPending} className="font-medium text-slate-950 underline disabled:opacity-60">
            {scan.isPending ? t('dashboard.scanning') : t('dashboard.scanNow')}
          </button>
        </div>
      </div>

      {(overview.error || scan.error) && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {t('dashboard.healthError')}
        </div>
      )}

      <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          [t('dashboard.knownSkills'), overview.isLoading ? '...' : (data?.knownSkills ?? 0)],
          [t('dashboard.globalSkills'), overview.isLoading ? '...' : (data?.skillsInstalledGlobally ?? 0)],
          [t('dashboard.projectSkills'), overview.isLoading ? '...' : (data?.skillsInstalledInProjects ?? 0)],
          [t('dashboard.catalogSkills'), overview.isLoading ? '...' : (data?.catalogOnlySkills ?? 0)],
          [t('dashboard.registeredProjects'), overview.isLoading ? '...' : (data?.registeredProjects ?? 0)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-2xl font-semibold text-slate-950">{value}</p>
            <p className="mt-1 text-sm text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {data && (data.modifiedProjectCopies + data.updateAvailableSkills + data.sourceMissingSkills + data.missingProjects.length > 0) && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [t('dashboard.modifiedCopies'), data.modifiedProjectCopies],
            [t('dashboard.updatesAvailable'), data.updateAvailableSkills],
            [t('dashboard.missingSources'), data.sourceMissingSkills],
            [t('dashboard.missingProjects'), data.missingProjects.length],
          ].map(([label, value]) => <div key={label} className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-lg font-semibold text-amber-950">{value}</p><p className="text-xs text-amber-800">{label}</p></div>)}
        </div>
      )}

      {data?.knownSkills === 0 && data.registeredProjects === 0 && (
        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-950">{t('dashboard.setupTitle')}</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
            <li>{t('dashboard.setupProject')}</li>
            <li>{t('dashboard.setupAgents')}</li>
            <li>{t('dashboard.setupInstall')}</li>
          </ol>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          to="/skills"
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {t('dashboard.manageSkills')}
        </Link>
        <Link
          to="/projects"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {t('dashboard.manageProjects')}
        </Link>
      </div>
    </div>
  )
}
