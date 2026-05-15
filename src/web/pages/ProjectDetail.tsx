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
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <Link to="/projects" className="mb-4 inline-block text-sm font-medium text-slate-600 hover:text-slate-950">
        ← Back to Projects
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-slate-950">{project.name}</h1>
      <p className="mb-6 break-all text-xs text-slate-400">{project.path}</p>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-950">Project skill status</p>
        <div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="font-medium text-slate-800">Project install</span>: installed directly in this project.</p>
          <p><span className="font-medium text-slate-800">Global install</span>: inherited from a global install.</p>
          <p><span className="font-medium text-slate-800">Can install</span>: asset is known and can be installed here.</p>
          <p><span className="font-medium text-slate-800">No source</span>: asset exists, but cannot be reinstalled safely.</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => enableAll.mutate()}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
        >
          Install all available
        </button>
        <button
          onClick={() => disableAll.mutate()}
          className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          Uninstall project installs
        </button>
      </div>

      {skills.length === 0 ? (
        <p className="text-sm text-slate-400">No managed skills found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left font-medium text-slate-600">Skill asset</th>
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
