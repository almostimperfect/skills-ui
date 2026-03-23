import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProject, enableSkill, disableSkill, type AgentSkillStatus, type ProjectWithMatrix } from '../api.js'
import AgentToggle from '../components/AgentToggle.js'

const UNIVERSAL_PROJECT_AGENTS = new Set(['codex', 'gemini-cli'])

function uniqueProjectActions(
  project: ProjectWithMatrix,
  action: 'enable' | 'disable',
  projectPath: string
): Array<Promise<unknown>> {
  const seen = new Set<string>()
  const requests: Array<Promise<unknown>> = []

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

      requests.push(
        action === 'enable'
          ? enableSkill(skill.id, projectPath, agent)
          : disableSkill(skill.id, projectPath, agent)
      )
    }
  }

  return requests
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
      await Promise.all(uniqueProjectActions(project, 'enable', projectPath))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  const disableAll = useMutation({
    mutationFn: async () => {
      if (!project) return
      await Promise.all(uniqueProjectActions(project, 'disable', projectPath))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  if (isLoading) return <div className="p-8 text-gray-500">Loading...</div>
  if (error || !project) return <div className="p-8 text-red-600">Failed to load project</div>

  const skills = project.skills

  return (
    <div className="p-8">
      <Link to="/projects" className="text-sm text-indigo-600 hover:underline mb-4 inline-block">
        ← Back to Projects
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{project.name}</h1>
      <p className="text-xs text-gray-400 mb-6">{project.path}</p>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => enableAll.mutate()}
          className="px-3 py-1.5 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md hover:bg-indigo-100"
        >
          Enable all
        </button>
        <button
          onClick={() => disableAll.mutate()}
          className="px-3 py-1.5 text-xs bg-gray-50 text-gray-600 border border-gray-200 rounded-md hover:bg-gray-100"
        >
          Disable all
        </button>
      </div>

      {skills.length === 0 ? (
        <p className="text-gray-400 text-sm">No managed skills found.</p>
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
              {skills.map(skill => (
                <tr key={skill.id}>
                  <td className="px-4 py-3">
                    <Link
                      to={`/skills/${encodeURIComponent(skill.id)}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {skill.name}
                    </Link>
                  </td>
                  {project.agents.map(agent => (
                    <td key={agent} className="px-4 py-3 text-center">
                      <AgentToggle
                        skillId={skill.id}
                        projectPath={projectPath}
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
