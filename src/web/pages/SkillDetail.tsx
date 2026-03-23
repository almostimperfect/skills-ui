import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSkill, getSkillMaintenance, splitGlobalSkill, updateSkill } from '../api.js'
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

  if (isLoading) return <div className="p-8 text-gray-500">Loading...</div>
  if (error || !skill) return <div className="p-8 text-red-600">Failed to load skill</div>

  const projectPaths = Object.keys(skill.status)
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
    <div className="p-8">
      <Link to="/skills" className="text-sm text-indigo-600 hover:underline mb-4 inline-block">
        ← Back to Skills
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{skill.name}</h1>
      {skill.description && <p className="text-gray-500 mb-6">{skill.description}</p>}
      {skill.source && (
        <p className="text-xs text-gray-400 mb-6">Source: {skill.source}</p>
      )}

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Maintenance</p>
            {maintenanceQuery.isLoading && (
              <p className="mt-1 text-sm text-gray-500">Inspecting update and drift status...</p>
            )}
            {maintenanceQuery.isError && (
              <p className="mt-1 text-sm text-red-600">Failed to load maintenance status.</p>
            )}
            {maintenance && (
              <>
                <p className="mt-1 text-sm text-gray-700">
                  Global update: <span className="font-medium">{maintenance.update.status}</span>
                  {maintenance.update.reason ? ` (${maintenance.update.reason})` : ''}
                </p>
                {maintenance.update.updatedAt && (
                  <p className="mt-1 text-xs text-gray-500">Last updated: {maintenance.update.updatedAt}</p>
                )}
                {maintenance.modifiedProjects.length > 0 ? (
                  <p className="mt-2 text-xs text-amber-700">
                    Modified project copies: {maintenance.modifiedProjects.map(project => project.projectPath.split('/').pop()).join(', ')}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">No modified project-local copies detected.</p>
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
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
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

      {projectPaths.length === 0 ? (
        <p className="text-gray-400 text-sm">No projects registered. Add a project to manage this skill.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Project</th>
                {Object.keys(skill.status[projectPaths[0]] ?? {}).map(agent => (
                  <th key={agent} className="text-center px-4 py-3 font-medium text-gray-600">
                    {agent}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {projectPaths.map(projectPath => (
                <tr key={projectPath}>
                  <td className="px-4 py-3 text-gray-700">{projectPath.split('/').pop()}</td>
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
