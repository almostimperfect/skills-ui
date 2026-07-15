import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getSkills, getProjects, type Skill } from '../api.js'

function countSkills(skills: Skill[] | undefined) {
  const list = skills ?? []
  return {
    total: list.length,
    global: list.filter(skill => skill.instances?.some(instance => instance.scope === 'global')).length,
    project: list.filter(skill => skill.instances?.some(instance => instance.scope === 'project')).length,
    catalogOnly: list.filter(skill => (skill.instances?.length ?? 0) === 0).length,
  }
}

export default function Dashboard() {
  const skills = useQuery({ queryKey: ['skills'], queryFn: getSkills })
  const projects = useQuery({ queryKey: ['projects'], queryFn: getProjects })
  const counts = countSkills(skills.data)

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Asset overview</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Dashboard</h1>
      </div>

      {skills.error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load skill assets. Project discovery or the skills CLI may need attention.
        </div>
      )}

      <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Known assets', skills.isLoading ? '...' : counts.total],
          ['Global installs', skills.isLoading ? '...' : counts.global],
          ['Project installs', skills.isLoading ? '...' : counts.project],
          ['Catalog only', skills.isLoading ? '...' : counts.catalogOnly],
          ['Projects', projects.isLoading ? '...' : (projects.data?.length ?? 0)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-2xl font-semibold text-slate-950">{value}</p>
            <p className="mt-1 text-sm text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/skills"
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Manage Assets
        </Link>
        <Link
          to="/projects"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Manage Projects
        </Link>
      </div>
    </div>
  )
}
