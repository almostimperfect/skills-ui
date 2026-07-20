import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { enableSkill, getProjects, type SkillWithStatus } from '../api.js'
import { useI18n } from '../i18n/I18nProvider.js'

interface Props {
  skill: SkillWithStatus
}

export default function InstallProjectPanel({ skill }: Props) {
  const { localizeError, t } = useI18n()
  const qc = useQueryClient()
  const [selectedPath, setSelectedPath] = useState('')
  const [successProject, setSuccessProject] = useState('')
  const { data: projects, isLoading, isError } = useQuery({ queryKey: ['projects'], queryFn: getProjects })

  useEffect(() => {
    if (!selectedPath && projects?.[0]) setSelectedPath(projects[0].path)
  }, [projects, selectedPath])

  const selected = projects?.find(project => project.path === selectedPath)
  const selectedStatuses = selected ? Object.values(skill.status[selected.path] ?? {}) : []
  const inheritedGlobally = selectedStatuses.some(status => status.state === 'global')
  const installedLocally = selectedStatuses.some(status => status.state === 'project')
  const actions = useMemo(() => {
    if (!selected) return []
    const rows = Object.entries(skill.status[selected.path] ?? {}).filter(([, status]) => status.canEnable)
    const seen = new Set<string>()
    return rows.filter(([agent, status]) => {
      const key = [agent, ...(status.sharedWith ?? [])].sort().join('|')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [selected, skill.status])

  const install = useMutation({
    mutationFn: ({ projectPath, agent }: { projectPath: string; agent: string }) =>
      enableSkill(skill.id, projectPath, agent),
    onSuccess: async () => {
      if (selected) setSuccessProject(selected.name)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['skill'] }),
        qc.invalidateQueries({ queryKey: ['skills'] }),
        qc.invalidateQueries({ queryKey: ['project'] }),
        qc.invalidateQueries({ queryKey: ['overview'] }),
      ])
    },
  })

  return (
    <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-medium text-slate-950">{t('installProject.title')}</h2>
      <p className="mt-1 text-xs text-slate-500">{t('installProject.help')}</p>
      {isLoading && <p className="mt-3 text-sm text-slate-500">{t('installProject.loading')}</p>}
      {isError && <p role="alert" className="mt-3 text-sm text-red-700">{t('installProject.loadError')}</p>}
      {projects?.length === 0 && (
        <p className="mt-3 text-sm text-slate-600">
          {t('installProject.noProjects')}{' '}
          <Link className="font-medium text-slate-950 underline" to={`/projects?returnSkill=${encodeURIComponent(skill.id)}`}>
            {t('installProject.register')}
          </Link>
        </p>
      )}
      {projects && projects.length > 0 && (
        <>
          <label htmlFor="install-project" className="mt-3 block text-xs font-medium text-slate-700">{t('installProject.projectLabel')}</label>
          <select
            id="install-project"
            value={selectedPath}
            onChange={event => { setSelectedPath(event.target.value); setSuccessProject('') }}
            className="mt-1 w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {projects.map(project => <option key={project.path} value={project.path}>{project.name}</option>)}
          </select>
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map(([agent, status]) => {
              const group = Array.from(new Set([agent, ...(status.sharedWith ?? [])])).join(', ')
              return (
                <button
                  key={group}
                  aria-label={t('installProject.ariaInstall', {
                    skill: skill.name,
                    project: selected?.name ?? t('installProject.projectLabel'),
                    agents: group,
                  })}
                  onClick={() => selected && install.mutate({ projectPath: selected.path, agent })}
                  disabled={install.isPending}
                  className="rounded-md bg-slate-950 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {install.isPending ? t('installProject.installing') : t('installProject.installFor', { agents: group })}
                </button>
              )
            })}
            {selected && actions.length === 0 && (
              <p className="text-sm text-slate-500">
                {installedLocally
                  ? t('installProject.installed')
                  : inheritedGlobally
                    ? t('installProject.inherited')
                    : t('installProject.noTargets')}
              </p>
            )}
          </div>
        </>
      )}
      {successProject && (
        <p role="status" className="mt-3 text-sm text-emerald-700">
          {t('skill.installProjectSuccess', { skill: skill.name, project: successProject })}
        </p>
      )}
      {install.isError && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {localizeError(install.error, 'installProject.error')}
        </p>
      )}
    </section>
  )
}
