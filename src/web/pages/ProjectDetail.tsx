import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProject, enableSkill, disableSkill } from '../api.js'
import AgentToggle from '../components/AgentToggle.js'

async function settleChanges(changes: Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(changes)
  const failed = results.filter(result => result.status === 'rejected').length
  if (failed > 0) throw new Error(`${failed} ${failed === 1 ? 'change' : 'changes'} failed`)
}

export default function ProjectDetail() {
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
      if (!project) return
      await settleChanges(
        Object.keys(project.matrix).flatMap(skillName =>
          project.agents.flatMap(agent =>
            project.matrix[skillName][agent] === 'disabled'
              ? [enableSkill(skillName, projectPath, agent)]
              : []
          )
        )
      )
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  })

  const disableAll = useMutation({
    mutationFn: async () => {
      if (!project) return
      await settleChanges(
        Object.keys(project.matrix).flatMap(skillName =>
          project.agents.flatMap(agent =>
            project.matrix[skillName][agent] === 'enabled'
              ? [disableSkill(skillName, projectPath, agent)]
              : []
          )
        )
      )
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  })

  const bulkPending = enableAll.isPending || disableAll.isPending
  const bulkError = enableAll.error || disableAll.error

  if (isLoading) return <div className="p-8 text-gray-500">Loading...</div>
  if (error || !project) return <div className="p-8 text-red-600">Failed to load project</div>

  const skillNames = Object.keys(project.matrix)

  return (
    <div className="p-8">
      <Link to="/projects" className="text-sm text-indigo-600 hover:underline mb-4 inline-block">
        ← Back to Projects
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{project.name}</h1>
      <p className="text-xs text-gray-400 mb-6">{project.path}</p>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => {
            enableAll.reset()
            disableAll.reset()
            enableAll.mutate()
          }}
          disabled={bulkPending}
          className="px-3 py-1.5 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md hover:bg-indigo-100 disabled:opacity-50"
        >
          {enableAll.isPending ? 'Enabling...' : 'Enable all'}
        </button>
        <button
          onClick={() => {
            enableAll.reset()
            disableAll.reset()
            disableAll.mutate()
          }}
          disabled={bulkPending}
          className="px-3 py-1.5 text-xs bg-gray-50 text-gray-600 border border-gray-200 rounded-md hover:bg-gray-100 disabled:opacity-50"
        >
          {disableAll.isPending ? 'Disabling...' : 'Disable all'}
        </button>
      </div>
      {bulkError && (
        <p role="alert" className="text-red-600 text-sm mb-4">
          {(bulkError as Error).message}
        </p>
      )}

      {skillNames.length === 0 ? (
        <p className="text-gray-400 text-sm">No skills installed globally.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Skill</th>
                {project.agents.map(agent => (
                  <th key={agent} className="text-center px-4 py-3 font-medium text-gray-600">
                    {agent}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {skillNames.map(skillName => (
                <tr key={skillName}>
                  <td className="px-4 py-3">
                    <Link
                      to={`/skills/${encodeURIComponent(skillName)}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {skillName}
                    </Link>
                  </td>
                  {project.agents.map(agent => (
                    <td key={agent} className="px-4 py-3 text-center">
                      <AgentToggle
                        skillName={skillName}
                        projectPath={projectPath}
                        agent={agent}
                        status={project.matrix[skillName][agent] ?? 'enabled'}
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
