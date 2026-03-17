import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getSkills, removeSkill } from '../api.js'
import AddSkillDialog from '../components/AddSkillDialog.js'

export default function Skills() {
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const qc = useQueryClient()
  const { data: skills, isLoading, error } = useQuery({ queryKey: ['skills'], queryFn: getSkills })
  const removeMutation = useMutation({
    mutationFn: removeSkill,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skills'] }),
  })

  const filtered = skills?.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Skills</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
        >
          Add Skill
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search skills..."
        className="w-full mb-4 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {isLoading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-600">Failed to load skills</p>}

      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
        {filtered?.map(skill => (
          <div key={skill.name} className="flex items-center justify-between px-4 py-3">
            <div>
              <Link
                to={`/skills/${encodeURIComponent(skill.name)}`}
                className="text-sm font-medium text-indigo-600 hover:underline"
              >
                {skill.name}
              </Link>
              {skill.description && (
                <p className="text-sm text-gray-500">{skill.description}</p>
              )}
            </div>
            <button
              onClick={() => removeMutation.mutate(skill.name)}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Remove
            </button>
          </div>
        ))}
        {filtered?.length === 0 && (
          <p className="text-center text-gray-400 py-8 text-sm">No skills found</p>
        )}
      </div>

      {showAdd && <AddSkillDialog onClose={() => setShowAdd(false)} />}
    </div>
  )
}
