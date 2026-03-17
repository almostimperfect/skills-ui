import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getSkills, getProjects } from '../api.js'

export default function Dashboard() {
  const skills = useQuery({ queryKey: ['skills'], queryFn: getSkills })
  const projects = useQuery({ queryKey: ['projects'], queryFn: getProjects })

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-3xl font-bold text-indigo-600">
            {skills.data?.length ?? '—'}
          </p>
          <p className="text-sm text-gray-500 mt-1">Installed skills</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-3xl font-bold text-indigo-600">
            {projects.data?.length ?? '—'}
          </p>
          <p className="text-sm text-gray-500 mt-1">Registered projects</p>
        </div>
      </div>
      <div className="flex gap-3">
        <Link
          to="/skills"
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
        >
          Manage Skills
        </Link>
        <Link
          to="/projects"
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50"
        >
          Manage Projects
        </Link>
      </div>
    </div>
  )
}
