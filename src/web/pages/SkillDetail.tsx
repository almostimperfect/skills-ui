import { useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, forgetCatalogSkill, getSkill, getSkillMaintenance, installGlobalSkill, reinstallProjectSkill, splitGlobalSkill, updateSkill } from '../api.js'
import AgentSkillControl from '../components/AgentSkillControl.js'
import InstallProjectPanel from '../components/InstallProjectPanel.js'
import { useI18n } from '../i18n/I18nProvider.js'

export default function SkillDetail() {
  const { formatDate, localizeError, t } = useI18n()
  const { name: encodedSkillId } = useParams<{ name: string }>()
  const skillId = encodedSkillId ?? ''
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: skill, isLoading, error } = useQuery({
    queryKey: ['skill', skillId],
    queryFn: () => getSkill(skillId),
    enabled: !!skillId,
  })
  const maintenanceQuery = useQuery({
    queryKey: ['skill', skillId, 'maintenance'],
    queryFn: () => getSkillMaintenance(skillId),
    enabled: !!skillId,
  })
  const splitMutation = useMutation({
    mutationFn: () => splitGlobalSkill(skillId),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['skill', skillId] }),
        qc.invalidateQueries({ queryKey: ['skill', skillId, 'maintenance'] }),
        qc.invalidateQueries({ queryKey: ['skills'] }),
        qc.invalidateQueries({ queryKey: ['project'] }),
      ])
    },
  })
  const updateMutation = useMutation({
    mutationFn: () => updateSkill(skillId),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['skill', skillId] }),
        qc.invalidateQueries({ queryKey: ['skill', skillId, 'maintenance'] }),
        qc.invalidateQueries({ queryKey: ['skills'] }),
      ])
    },
  })
  const installGlobalMutation = useMutation({
    mutationFn: () => installGlobalSkill(skillId),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['skill', skillId] }),
        qc.invalidateQueries({ queryKey: ['skill', skillId, 'maintenance'] }),
        qc.invalidateQueries({ queryKey: ['skills'] }),
      ])
    },
  })
  const reinstallProjectMutation = useMutation({
    mutationFn: (projectPath: string) => reinstallProjectSkill(skillId, projectPath),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['skill'] }),
        qc.invalidateQueries({ queryKey: ['project'] }),
        qc.invalidateQueries({ queryKey: ['skills'] }),
        qc.invalidateQueries({ queryKey: ['overview'] }),
      ])
    },
  })
  const forgetMutation = useMutation({
    mutationFn: () => forgetCatalogSkill(skillId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
      navigate('/skills', { replace: true })
    },
  })

  useEffect(() => {
    if (skill && skillId && skill.id !== skillId) {
      navigate(`/skills/${encodeURIComponent(skill.id)}`, { replace: true })
    }
  }, [navigate, skill, skillId])

  if (isLoading) return <div className="p-8 text-gray-500">{t('skillDetail.loading')}</div>
  if (error instanceof ApiError && error.status === 404) return <div className="p-8 text-red-600">{t('skillDetail.notFound')}</div>
  if (error || !skill) return <div className="p-8 text-red-600">{t('skillDetail.loadError')}</div>

  const projectPaths = Object.keys(skill.status)
  const instances = skill.instances ?? []
  const hasGlobal = instances.some(instance => instance.scope === 'global')
  const projectInstallCount = instances.filter(instance => instance.scope === 'project').length
  const globalRows = projectPaths.flatMap(projectPath =>
    Object.entries(skill.status[projectPath] ?? {})
      .filter(([, status]) => status?.state === 'global')
      .map(([agent]) => ({
        projectPath,
        agent,
      }))
  )
  const canSplitGlobal = globalRows.length > 0 && skill.reinstallable
  const splitDisabledReason = globalRows.length === 0
    ? t('skillDetail.splitNoProjects')
    : t('skillDetail.splitUnsafe')
  const maintenance = maintenanceQuery.data

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <Link to="/skills" className="mb-4 inline-block text-sm font-medium text-slate-600 hover:text-slate-950">
        {t('skillDetail.back')}
      </Link>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('skillDetail.eyebrow')}</p>
            <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-slate-950">{skill.name}</h1>
            {skill.description && <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{skill.description}</p>}
            {skill.source && (
              <p className="mt-3 break-all text-xs text-slate-400">{t('skillDetail.source', { source: skill.source })}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {!hasGlobal && (
              <button
                onClick={() => installGlobalMutation.mutate()}
                disabled={!skill.reinstallable || installGlobalMutation.isPending}
                className="rounded-md bg-slate-950 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {installGlobalMutation.isPending ? t('skillDetail.installing') : t('skillDetail.installGlobally')}
              </button>
            )}
            {instances.length === 0 && (
              <button
                onClick={() => {
                  if (!window.confirm(t('skillDetail.forgetConfirm', { skill: skill.name }))) return
                  forgetMutation.mutate()
                }}
                disabled={forgetMutation.isPending}
                className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                {forgetMutation.isPending ? t('skillDetail.forgetting') : t('skillDetail.forget')}
              </button>
            )}
          </div>
        </div>
        {installGlobalMutation.isError && (
          <p className="mt-3 text-xs text-red-700">
            {localizeError(installGlobalMutation.error, 'skillDetail.installGlobalError')}
          </p>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xl font-semibold text-slate-950">{hasGlobal ? 1 : 0}</p>
            <p className="text-xs text-slate-500">{t('skillDetail.globalInstalls')}</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xl font-semibold text-slate-950">{projectInstallCount}</p>
            <p className="text-xs text-slate-500">{t('skillDetail.projectInstalls')}</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xl font-semibold text-slate-950">{skill.reinstallable ? t('skillDetail.yes') : t('skillDetail.no')}</p>
            <p className="text-xs text-slate-500">{t('skillDetail.reinstallable')}</p>
          </div>
        </div>
      </div>

      <InstallProjectPanel skill={skill} />

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-950">{t('skillDetail.glossaryTitle')}</p>
        <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-slate-800">{t('projectDetail.projectInstall')}</span>: {t('skillDetail.glossaryProject')}</p>
          <p><span className="font-medium text-slate-800">{t('projectDetail.globalInstall')}</span>: {t('skillDetail.glossaryGlobal')}</p>
          <p><span className="font-medium text-slate-800">{t('projectDetail.canInstall')}</span>: {t('skillDetail.glossaryAvailable')}</p>
          <p><span className="font-medium text-slate-800">{t('projectDetail.noSource')}</span>: {t('skillDetail.glossaryNoSource')}</p>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-950">{t('skillDetail.maintenance')}</p>
            {maintenanceQuery.isLoading && (
              <p className="mt-1 text-sm text-gray-500">{t('skillDetail.inspecting')}</p>
            )}
            {maintenanceQuery.isError && (
              <p className="mt-1 text-sm text-red-600">{t('skillDetail.maintenanceError')}</p>
            )}
            {maintenance && (
              <>
                <p className="mt-1 text-sm text-slate-700">
                  {t('skillDetail.globalUpdate', {
                    status: t(maintenance.update.status === 'update-available'
                      ? 'skillDetail.statusUpdateAvailable'
                      : maintenance.update.status === 'up-to-date'
                        ? 'skillDetail.statusUpToDate'
                        : maintenance.update.status === 'unsupported'
                          ? 'skillDetail.statusUnsupported'
                          : 'skillDetail.statusUnknown'),
                  })}
                  {maintenance.update.reason ? ` (${localizeError(new Error(maintenance.update.reason), 'skillDetail.statusUnknown')})` : ''}
                </p>
                {maintenance.update.updatedAt && (
                  <p className="mt-1 text-xs text-slate-500">{t('skillDetail.lastUpdated', { date: formatDate(maintenance.update.updatedAt) })}</p>
                )}
                {maintenance.modifiedProjects.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {maintenance.modifiedProjects.map(project => (
                      <div key={project.projectPath} className="flex flex-wrap items-center gap-2 text-xs text-amber-800">
                        <span>{t('skillDetail.modifiedCopy', { project: project.projectPath.split(/[\\/]/).filter(Boolean).pop() ?? project.projectPath })}</span>
                        <button
                          onClick={() => {
                            if (!window.confirm(t('skillDetail.reinstallConfirm', { skill: skill.name }))) return
                            reinstallProjectMutation.mutate(project.projectPath)
                          }}
                          disabled={reinstallProjectMutation.isPending}
                          className="font-medium underline disabled:opacity-60"
                        >
                          {reinstallProjectMutation.isPending ? t('skillDetail.reinstalling') : t('skillDetail.reinstall')}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">{t('skillDetail.noModifiedCopies')}</p>
                )}
              </>
            )}
            {updateMutation.isError && (
              <p className="mt-2 text-xs text-red-700">
                {localizeError(updateMutation.error, 'skillDetail.updateError')}
              </p>
            )}
            {(reinstallProjectMutation.isError || forgetMutation.isError) && (
              <p role="alert" className="mt-2 text-xs text-red-700">
                {localizeError(reinstallProjectMutation.error ?? forgetMutation.error, 'skillDetail.actionError')}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              if (maintenance?.update.status !== 'update-available' || updateMutation.isPending) return
              updateMutation.mutate()
            }}
            disabled={maintenance?.update.status !== 'update-available' || updateMutation.isPending}
            title={maintenance?.update.status === 'update-available'
              ? t('skillDetail.updateAvailableTitle')
              : t('skillDetail.noUpdateTitle')}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updateMutation.isPending ? t('skillDetail.updating') : t('skillDetail.updateGlobal')}
          </button>
        </div>
      </div>

      {globalRows.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-amber-900">{t('skillDetail.inheritedTitle')}</p>
              <p className="mt-1 text-sm text-amber-800">
                {t('skillDetail.inheritedHelp')}
              </p>
              <p className="mt-2 text-xs text-amber-700">
                {t('skillDetail.affected', { targets: globalRows.map(({ projectPath, agent }) => `${projectPath.split('/').pop()} (${agent})`).join(', ') })}
              </p>
              {!skill.reinstallable && (
                <p className="mt-2 text-xs text-red-700">
                  {t('skillDetail.splitNoSource')}
                </p>
              )}
              {splitMutation.isError && (
                <p className="mt-2 text-xs text-red-700">
                  {localizeError(splitMutation.error, 'skillDetail.splitError')}
                </p>
              )}
            </div>
            <button
              onClick={() => {
                if (!canSplitGlobal || splitMutation.isPending) return
                const impact = globalRows.map(({ projectPath, agent }) => `${projectPath.split(/[\\/]/).filter(Boolean).pop()} (${agent})`).join(', ')
                if (!window.confirm(t('skillDetail.splitConfirm', { skill: skill.name, targets: impact }))) return
                splitMutation.mutate()
              }}
              disabled={!canSplitGlobal || splitMutation.isPending}
              title={canSplitGlobal ? t('skillDetail.splitTitle') : splitDisabledReason}
              className="rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {splitMutation.isPending ? t('skillDetail.splitting') : t('skillDetail.splitAction')}
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-slate-950">{t('skillDetail.instances')}</p>
        {instances.length === 0 ? (
          <p className="text-sm text-slate-500">{t('skillDetail.noInstances')}</p>
        ) : (
          <div className="space-y-2">
            {instances.map(instance => (
              <div key={`${instance.scope}:${instance.path}`} className="rounded-md bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium capitalize text-slate-700 ring-1 ring-slate-200">
                    {t(instance.scope === 'global' ? 'skillDetail.scopeGlobal' : 'skillDetail.scopeProject')}
                  </span>
                  {instance.projectPath && (
                    <span className="text-xs text-slate-500">{instance.projectPath.split('/').pop()}</span>
                  )}
                  {instance.agents.length > 0 && (
                    <span className="text-xs text-slate-500">{instance.agents.join(', ')}</span>
                  )}
                </div>
                <p className="mt-2 break-all text-xs text-slate-400">{instance.path}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {projectPaths.length === 0 ? (
        <p className="text-sm text-slate-400">{t('skillDetail.noProjects')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left font-medium text-slate-600">{t('skillDetail.project')}</th>
                {Object.keys(skill.status[projectPaths[0]] ?? {}).map(agent => (
                  <th key={agent} className="px-4 py-3 text-center font-medium text-slate-600">
                    {agent}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projectPaths.map(projectPath => (
                <tr key={projectPath}>
                  <td className="px-4 py-3 text-slate-700">{projectPath.split('/').pop()}</td>
                  {Object.entries(skill.status[projectPath] ?? {}).map(([agent, status]) => (
                    <td key={agent} className="px-4 py-3 text-center">
                      <AgentSkillControl
                        skillId={skill.id}
                        skillName={skill.name}
                        projectPath={projectPath}
                        projectName={projectPath.split(/[\\/]/).filter(Boolean).pop()}
                        agent={agent}
                        status={status ?? {
                          state: 'unavailable',
                          canEnable: false,
                          canDisable: false,
                        }}
                        invalidateKey={['skill', skill.id]}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
