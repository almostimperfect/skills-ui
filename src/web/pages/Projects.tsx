import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getAgents, getProjects, registerProject, unregisterProject, updateProject } from '../api.js'

export default function Projects() {
  const [showAdd, setShowAdd] = useState(false)
  const [newPath, setNewPath] = useState('')
  const [newAgents, setNewAgents] = useState<string[]>(['codex'])
  const qc = useQueryClient()
  const { data: projects, isLoading } = useQuery({ queryKey: ['projects'], queryFn: getProjects })
  const { data: supportedAgents } = useQuery({ queryKey: ['agents'], queryFn: getAgents })

  const addMutation = useMutation({
    mutationFn: () => registerProject(newPath, newAgents),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setShowAdd(false)
      setNewPath('')
      setNewAgents(['codex'])
    },
  })

  const updateAgentsMutation = useMutation({
    mutationFn: ({ path, agents }: { path: string; agents: string[] }) => updateProject(path, { agents }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['projects'] }),
        qc.invalidateQueries({ queryKey: ['project'] }),
        qc.invalidateQueries({ queryKey: ['skills'] }),
      ])
    },
  })

  const removeMutation = useMutation({
    mutationFn: unregisterProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
        >
          Add Project
        </button>
      </div>

      {showAdd && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <input
            type="text"
            value={newPath}
            onChange={e => setNewPath(e.target.value)}
            placeholder="/absolute/path/to/project"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
          />
          <div className="mb-3 flex flex-wrap gap-2">
            {supportedAgents?.map(agent => {
              const enabled = newAgents.includes(agent)
              return (
                <button
                  key={agent}
                  onClick={() => setNewAgents(enabled
                    ? newAgents.filter(item => item !== agent)
                    : [...newAgents, agent]
                  )}
                  disabled={enabled && newAgents.length === 1}
                  className={`rounded-full border px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                    enabled
                      ? 'border-slate-900 bg-slate-950 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {agent}
                </button>
              )
            })}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => addMutation.mutate()}
              disabled={!newPath || addMutation.isPending}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {addMutation.isPending ? 'Adding...' : 'Add'}
            </button>
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-gray-600">
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-gray-500">Loading...</p>}

      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
        {projects?.map(project => (
          <div key={project.path} className="flex items-center justify-between px-4 py-3">
            <div>
              <Link
                to={`/projects/${encodeURIComponent(project.path)}`}
                className="text-sm font-medium text-indigo-600 hover:underline"
              >
                {project.name}
              </Link>
              <p className="text-xs text-gray-400">{project.path}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {supportedAgents?.map(agent => {
                  const enabled = project.agents.includes(agent)
                  const next = enabled
                    ? project.agents.filter(item => item !== agent)
                    : [...project.agents, agent]
                  return (
                    <button
                      key={agent}
                      onClick={() => updateAgentsMutation.mutate({ path: project.path, agents: next })}
                      disabled={updateAgentsMutation.isPending || (enabled && project.agents.length === 1)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                        enabled
                          ? 'border-slate-900 bg-slate-950 text-white'
                          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {agent}
                    </button>
                  )
                })}
              </div>
            </div>
            <button
              onClick={() => removeMutation.mutate(project.path)}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Remove
            </button>
          </div>
        ))}
        {projects?.length === 0 && (
          <p className="text-center text-gray-400 py-8 text-sm">No projects registered</p>
        )}
      </div>
    </div>
  )
}
