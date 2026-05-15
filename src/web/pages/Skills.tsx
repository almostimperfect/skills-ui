import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getGlobalAgents, getSkills, installGlobalSkill, removeSkill, updateGlobalAgents, type Skill } from '../api.js'
import AddSkillDialog from '../components/AddSkillDialog.js'

type Filter = 'all' | 'global' | 'project' | 'catalog'

function getAssetState(skill: Skill): { label: string; tone: string } {
  const instances = skill.instances ?? []
  const hasGlobal = instances.some(instance => instance.scope === 'global')
  const hasProject = instances.some(instance => instance.scope === 'project')
  if (hasGlobal && hasProject) return { label: 'Global + project', tone: 'bg-blue-50 text-blue-700 border-blue-200' }
  if (hasGlobal) return { label: 'Global', tone: 'bg-slate-100 text-slate-700 border-slate-200' }
  if (hasProject) return { label: 'Project', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  return { label: 'Catalog only', tone: 'bg-amber-50 text-amber-700 border-amber-200' }
}

function sourceLabel(skill: Skill): string {
  if (!skill.source) return 'No source recorded'
  if (skill.source.includes('/.skills-ui/archive/')) return 'Archived copy'
  if (skill.source.startsWith('http')) return 'Remote source'
  if (skill.source.startsWith('/')) return skill.source.split('/').slice(-2).join('/')
  return skill.source
}

function counts(skill: Skill) {
  const instances = skill.instances ?? []
  return {
    global: instances.filter(instance => instance.scope === 'global').length,
    project: instances.filter(instance => instance.scope === 'project').length,
  }
}

export default function Skills() {
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const qc = useQueryClient()
  const { data: skills, isLoading, error } = useQuery({ queryKey: ['skills'], queryFn: getSkills })
  const { data: globalAgents } = useQuery({ queryKey: ['agents', 'global'], queryFn: getGlobalAgents })
  const removeMutation = useMutation({
    mutationFn: removeSkill,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skills'] }),
  })
  const installGlobalMutation = useMutation({
    mutationFn: installGlobalSkill,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['skills'] }),
        qc.invalidateQueries({ queryKey: ['skill'] }),
      ])
    },
  })
  const updateGlobalAgentsMutation = useMutation({
    mutationFn: updateGlobalAgents,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['agents', 'global'] })
    },
  })
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = skills?.filter(skill => {
    const haystack = `${skill.name} ${skill.description} ${skill.source}`.toLowerCase()
    if (!haystack.includes(search.toLowerCase())) return false
    const c = counts(skill)
    if (filter === 'global') return c.global > 0
    if (filter === 'project') return c.project > 0
    if (filter === 'catalog') return (skill.instances?.length ?? 0) === 0
    return true
  })

  const summary = {
    all: skills?.length ?? 0,
    global: skills?.filter(skill => counts(skill).global > 0).length ?? 0,
    project: skills?.filter(skill => counts(skill).project > 0).length ?? 0,
    catalog: skills?.filter(skill => (skill.instances?.length ?? 0) === 0).length ?? 0,
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Skill assets</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Assets</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Known skills stay in the catalog even when every installation is removed.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="w-full rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:w-auto"
        >
          Add Asset
        </button>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-950">Global install targets</p>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              Install Global writes only to these enabled AI tools. Project installs use each project's enabled tools.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {globalAgents?.supported.map(agent => {
              const enabled = globalAgents.enabled.includes(agent)
              const next = enabled
                ? globalAgents.enabled.filter(item => item !== agent)
                : [...globalAgents.enabled, agent]
              return (
                <button
                  key={agent}
                  onClick={() => updateGlobalAgentsMutation.mutate(next)}
                  disabled={updateGlobalAgentsMutation.isPending || (enabled && globalAgents.enabled.length === 1)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                    enabled
                      ? 'border-slate-900 bg-slate-950 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                  title={enabled && globalAgents.enabled.length === 1 ? 'Keep at least one global install target enabled.' : undefined}
                >
                  {agent}
                </button>
              )
            })}
          </div>
        </div>
        {updateGlobalAgentsMutation.isError && (
          <p className="mt-2 text-xs text-red-700">
            {updateGlobalAgentsMutation.error instanceof Error ? updateGlobalAgentsMutation.error.message : 'Failed to update global install targets.'}
          </p>
        )}
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search assets, descriptions, or sources..."
          className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        <div className="flex flex-wrap gap-2">
          {([
            ['all', `All ${summary.all}`],
            ['global', `Global ${summary.global}`],
            ['project', `Project ${summary.project}`],
            ['catalog', `Catalog ${summary.catalog}`],
          ] as Array<[Filter, string]>).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                filter === key
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading assets...</p>}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load skill assets. Reconcile may be blocked by a missing project or skills CLI error.
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {filtered?.map(skill => (
          <div key={skill.id} className="grid gap-4 border-b border-slate-100 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getAssetState(skill).tone}`}>
                  {getAssetState(skill).label}
                </span>
                <span className="text-xs text-slate-400">{sourceLabel(skill)}</span>
              </div>
              <Link
                to={`/skills/${encodeURIComponent(skill.id)}`}
                className="text-sm font-semibold text-slate-950 hover:underline"
              >
                {skill.name}
              </Link>
              {skill.description && (
                <p className="mt-1 line-clamp-2 max-w-4xl text-sm leading-6 text-slate-600">{skill.description}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                <span>{counts(skill).global} global installs</span>
                <span>{counts(skill).project} project installs</span>
                <span>{skill.reinstallable ? 'Reinstallable' : 'Source missing'}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-2 lg:justify-end">
              <Link
                to={`/skills/${encodeURIComponent(skill.id)}`}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Details
              </Link>
              {counts(skill).global > 0 ? (
                <button
                  onClick={() => {
                    if (!window.confirm(`Remove global install for ${skill.name}? The asset remains in the catalog.`)) return
                    removeMutation.mutate(skill.id)
                  }}
                  className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Uninstall Global
                </button>
              ) : (
                <button
                  onClick={() => installGlobalMutation.mutate(skill.id)}
                  disabled={!skill.reinstallable || installGlobalMutation.isPending}
                  className="rounded-md bg-slate-950 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  title={globalAgents ? `Install to: ${globalAgents.enabled.join(', ')}` : undefined}
                >
                  Install Global
                </button>
              )}
            </div>
          </div>
        ))}
        {filtered?.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">No assets found</p>
        )}
      </div>

      {showAdd && <AddSkillDialog onClose={() => setShowAdd(false)} />}
    </div>
  )
}
