import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProject, enableSkill, disableSkill, type AgentSkillStatus, type ProjectWithMatrix } from '../api.js'
import AgentSkillControl from '../components/AgentSkillControl.js'
import { useI18n } from '../i18n/I18nProvider.js'

const UNIVERSAL_PROJECT_AGENTS = new Set(['codex', 'gemini-cli'])

function uniqueProjectActions(
  project: ProjectWithMatrix,
  action: 'enable' | 'disable'
): Array<{ skillId: string; skillName: string; agent: string }> {
  const seen = new Set<string>()
  const actions: Array<{ skillId: string; skillName: string; agent: string }> = []

  for (const skill of project.skills) {
    const agents = action === 'enable'
      ? (() => {
          const exclusiveAgents = project.agents.filter(agent =>
            !UNIVERSAL_PROJECT_AGENTS.has(agent) && skill.status[agent]?.canEnable
          )
          return exclusiveAgents.length > 0
            ? exclusiveAgents
            : project.agents.filter(agent => skill.status[agent]?.canEnable)
        })()
      : project.agents.filter(agent => skill.status[agent]?.canDisable)

    for (const agent of agents) {
      const status = skill.status[agent] as AgentSkillStatus | undefined
      const allowed = action === 'enable' ? status?.canEnable : status?.canDisable
      if (!allowed) continue

      const group = [agent, ...(status?.sharedWith ?? [])].sort()
      const key = `${skill.id}:${action}:${group.join(',')}`
      if (seen.has(key)) continue
      seen.add(key)

      actions.push({ skillId: skill.id, skillName: skill.name, agent })
    }
  }

  return actions
}

export default function ProjectDetail() {
  const { t } = useI18n()
  const { projectPath: encoded } = useParams<{ projectPath: string }>()
  const projectPath = decodeURIComponent(encoded ?? '')
  const qc = useQueryClient()
  const queryKey = ['project', projectPath]

  const { data: project, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => getProject(projectPath),
    enabled: !!projectPath,
  })

  const enableAll = useMutation({
    mutationFn: async () => {
      if (!project) return { total: 0, failed: 0 }
      const actions = uniqueProjectActions(project, 'enable')
      const results = await Promise.allSettled(actions.map(action =>
        enableSkill(action.skillId, projectPath, action.agent)
      ))
      return { total: actions.length, failed: results.filter(result => result.status === 'rejected').length }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  const disableAll = useMutation({
    mutationFn: async () => {
      if (!project) return { total: 0, failed: 0 }
      const actions = uniqueProjectActions(project, 'disable')
      const results = await Promise.allSettled(actions.map(action =>
        disableSkill(action.skillId, projectPath, action.agent)
      ))
      return { total: actions.length, failed: results.filter(result => result.status === 'rejected').length }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  if (isLoading) return <div className="p-8 text-gray-500">{t('projectDetail.loading')}</div>
  if (error || !project) return <div className="p-8 text-red-600">{t('projectDetail.loadError')}</div>

  const skills = project.skills
  const confirmBulk = (action: 'enable' | 'disable') => {
    const actions = uniqueProjectActions(project, action)
    if (actions.length === 0) return
    const skillCount = new Set(actions.map(item => item.skillId)).size
    const message = t(
      action === 'enable' ? 'projectDetail.installConfirm' : 'projectDetail.uninstallConfirm',
      { skills: skillCount, targets: actions.length, project: project.name }
    )
    if (!window.confirm(message)) return
    if (action === 'enable') enableAll.mutate()
    else disableAll.mutate()
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <Link to="/projects" className="mb-4 inline-block text-sm font-medium text-slate-600 hover:text-slate-950">
        {t('projectDetail.back')}
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-slate-950">{project.name}</h1>
      <p className="mb-6 break-all text-xs text-slate-400">{project.path}</p>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-950">{t('projectDetail.statusTitle')}</p>
        <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-slate-800">{t('projectDetail.projectInstall')}</span>: {t('projectDetail.projectInstallHelp')}</p>
          <p><span className="font-medium text-slate-800">{t('projectDetail.globalInstall')}</span>: {t('projectDetail.globalInstallHelp')}</p>
          <p><span className="font-medium text-slate-800">{t('projectDetail.canInstall')}</span>: {t('projectDetail.canInstallHelp')}</p>
          <p><span className="font-medium text-slate-800">{t('projectDetail.noSource')}</span>: {t('projectDetail.noSourceHelp')}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => confirmBulk('enable')}
          disabled={enableAll.isPending || disableAll.isPending}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
        >
          {enableAll.isPending ? t('projectDetail.installing') : t('projectDetail.installAll')}
        </button>
        <button
          onClick={() => confirmBulk('disable')}
          disabled={enableAll.isPending || disableAll.isPending}
          className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          {disableAll.isPending ? t('projectDetail.uninstalling') : t('projectDetail.uninstallProject')}
        </button>
      </div>

      {((enableAll.data?.failed ?? 0) > 0 || (disableAll.data?.failed ?? 0) > 0) && (
        <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {t((enableAll.data ?? disableAll.data)!.failed === 1
            ? 'projectDetail.partialResultOne'
            : 'projectDetail.partialResultMany', {
            failed: (enableAll.data ?? disableAll.data)!.failed,
            succeeded: (enableAll.data ?? disableAll.data)!.total - (enableAll.data ?? disableAll.data)!.failed,
          })}
        </p>
      )}
      {(enableAll.data?.failed === 0 || disableAll.data?.failed === 0) && (
        <p role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {t((enableAll.data ?? disableAll.data)!.total === 1
            ? 'projectDetail.successResultOne'
            : 'projectDetail.successResultMany', { total: (enableAll.data ?? disableAll.data)!.total })}
        </p>
      )}

      {skills.length === 0 ? (
        <p className="text-sm text-slate-400">{t('projectDetail.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left font-medium text-slate-600">{t('projectDetail.skillAsset')}</th>
                {project.agents.map(agent => (
                  <th key={agent} className="px-4 py-3 text-center font-medium text-slate-600">
                    {agent}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {skills.map(skill => (
                <tr key={skill.id}>
                  <td className="px-4 py-3">
                    <Link
                      to={`/skills/${encodeURIComponent(skill.id)}`}
                      className="font-medium text-slate-950 hover:underline"
                    >
                      {skill.name}
                    </Link>
                    {skill.description && (
                      <p className="mt-1 line-clamp-2 max-w-lg text-xs leading-5 text-slate-500">{skill.description}</p>
                    )}
                  </td>
                  {project.agents.map(agent => (
                    <td key={agent} className="px-4 py-3 text-center">
                      <AgentSkillControl
                        skillId={skill.id}
                        skillName={skill.name}
                        projectPath={projectPath}
                        projectName={project.name}
                        agent={agent}
                        status={skill.status[agent] ?? {
                          state: 'unavailable',
                          canEnable: false,
                          canDisable: false,
                        }}
                        invalidateKey={queryKey}
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
