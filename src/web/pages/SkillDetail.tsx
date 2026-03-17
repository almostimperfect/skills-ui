import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getSkill } from '../api.js'
import AgentToggle from '../components/AgentToggle.js'

export default function SkillDetail() {
  const { name } = useParams<{ name: string }>()
  const { data: skill, isLoading, error } = useQuery({
    queryKey: ['skill', name],
    queryFn: () => getSkill(name!),
    enabled: !!name,
  })

  if (isLoading) return <div className="p-8 text-gray-500">Loading...</div>
  if (error || !skill) return <div className="p-8 text-red-600">Failed to load skill</div>

  const projectPaths = Object.keys(skill.status)

  return (
    <div className="p-8">
      <Link to="/skills" className="text-sm text-indigo-600 hover:underline mb-4 inline-block">
        ← Back to Skills
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{skill.name}</h1>
      {skill.description && <p className="text-gray-500 mb-6">{skill.description}</p>}

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
                        skillName={skill.name}
                        projectPath={projectPath}
                        agent={agent}
                        status={status}
                        invalidateKey={['skill', skill.name]}
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
