import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSkill, getSkillMaintenance, installGlobalSkill, splitGlobalSkill, updateSkill } from '../api.js'
import AgentToggle from '../components/AgentToggle.js'

export default function SkillDetail() {
  const { name: encodedSkillId } = useParams<{ name: string }>()
  const skillId = encodedSkillId ?? ''
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

  if (isLoading) return <div className="p-8 text-gray-500">Loading...</div>
  if (error || !skill) return <div className="p-8 text-red-600">Failed to load skill</div>

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
    ? 'No registered project inherits this skill from a global install.'
    : 'This skill has no reinstall source, so it cannot be copied into projects safely.'
  const maintenance = maintenanceQuery.data

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <Link to="/skills" className="mb-4 inline-block text-sm font-medium text-slate-600 hover:text-slate-950">
        ← Back to assets
      </Link>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Skill asset</p>
            <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-slate-950">{skill.name}</h1>
            {skill.description && <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{skill.description}</p>}
            {skill.source && (
              <p className="mt-3 break-all text-xs text-slate-400">Source: {skill.source}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {!hasGlobal && (
              <button
                onClick={() => installGlobalMutation.mutate()}
                disabled={!skill.reinstallable || installGlobalMutation.isPending}
                className="rounded-md bg-slate-950 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {installGlobalMutation.isPending ? 'Installing...' : 'Install Globally'}
              </button>
            )}
            <Link
              to="/projects"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Install To Project
            </Link>
          </div>
        </div>
        {installGlobalMutation.isError && (
          <p className="mt-3 text-xs text-red-700">
            {installGlobalMutation.error instanceof Error ? installGlobalMutation.error.message : 'Failed to install globally.'}
          </p>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xl font-semibold text-slate-950">{hasGlobal ? 1 : 0}</p>
            <p className="text-xs text-slate-500">Global installs</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xl font-semibold text-slate-950">{projectInstallCount}</p>
            <p className="text-xs text-slate-500">Project installs</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xl font-semibold text-slate-950">{skill.reinstallable ? 'Yes' : 'No'}</p>
            <p className="text-xs text-slate-500">Reinstallable</p>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-950">What the status labels mean</p>
        <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-slate-800">Project install</span>: this skill is installed directly in that project for the agent.</p>
          <p><span className="font-medium text-slate-800">Global install</span>: the agent sees this skill through the global skills folder.</p>
          <p><span className="font-medium text-slate-800">Can install</span>: the asset is known and can be installed into that project.</p>
          <p><span className="font-medium text-slate-800">No source</span>: skills-ui knows the asset, but cannot safely reinstall it.</p>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-950">Maintenance</p>
            {maintenanceQuery.isLoading && (
              <p className="mt-1 text-sm text-gray-500">Inspecting update and drift status...</p>
            )}
            {maintenanceQuery.isError && (
              <p className="mt-1 text-sm text-red-600">Failed to load maintenance status.</p>
            )}
            {maintenance && (
              <>
                <p className="mt-1 text-sm text-slate-700">
                  Global update: <span className="font-medium">{maintenance.update.status}</span>
                  {maintenance.update.reason ? ` (${maintenance.update.reason})` : ''}
                </p>
                {maintenance.update.updatedAt && (
                  <p className="mt-1 text-xs text-slate-500">Last updated: {maintenance.update.updatedAt}</p>
                )}
                {maintenance.modifiedProjects.length > 0 ? (
                  <p className="mt-2 text-xs text-amber-700">
                    Modified project copies: {maintenance.modifiedProjects.map(project => project.projectPath.split('/').pop()).join(', ')}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No modified project-local copies detected.</p>
                )}
              </>
            )}
            {updateMutation.isError && (
              <p className="mt-2 text-xs text-red-700">
                {updateMutation.error instanceof Error ? updateMutation.error.message : 'Failed to update the global skill.'}
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
              ? 'Reinstall the managed global skill from its recorded source.'
              : 'No managed global update is currently available.'}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updateMutation.isPending ? 'Updating...' : 'Update Global Skill'}
          </button>
        </div>
      </div>

      {globalRows.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-amber-900">Global install is inherited by managed projects.</p>
              <p className="mt-1 text-sm text-amber-800">
                Splitting removes the global instance and installs project-local copies for the registered projects that currently inherit it.
              </p>
              <p className="mt-2 text-xs text-amber-700">
                Affected: {globalRows.map(({ projectPath, agent }) => `${projectPath.split('/').pop()} (${agent})`).join(', ')}
              </p>
              {!skill.reinstallable && (
                <p className="mt-2 text-xs text-red-700">
                  No reinstall source is recorded for this skill, so split is disabled.
                </p>
              )}
              {splitMutation.isError && (
                <p className="mt-2 text-xs text-red-700">
                  {splitMutation.error instanceof Error ? splitMutation.error.message : 'Failed to split the global install.'}
                </p>
              )}
            </div>
            <button
              onClick={() => {
                if (!canSplitGlobal || splitMutation.isPending) return
                splitMutation.mutate()
              }}
              disabled={!canSplitGlobal || splitMutation.isPending}
              title={canSplitGlobal ? 'Replace the global instance with project-local installs.' : splitDisabledReason}
              className="rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {splitMutation.isPending ? 'Splitting...' : 'Split Global Into Projects'}
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-slate-950">Installed instances</p>
        {instances.length === 0 ? (
          <p className="text-sm text-slate-500">This asset is preserved in the catalog but is not installed anywhere.</p>
        ) : (
          <div className="space-y-2">
            {instances.map(instance => (
              <div key={`${instance.scope}:${instance.path}`} className="rounded-md bg-slate-50 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium capitalize text-slate-700 ring-1 ring-slate-200">
                    {instance.scope}
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
        <p className="text-sm text-slate-400">No projects registered. Add a project to manage this skill.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left font-medium text-slate-600">Project</th>
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
                      <AgentToggle
                        skillId={skill.id}
                        projectPath={projectPath}
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
