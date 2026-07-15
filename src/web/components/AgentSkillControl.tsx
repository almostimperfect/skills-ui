import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { disableSkill, enableSkill, type AgentSkillStatus } from '../api.js'

interface Props {
  skillId: string
  skillName: string
  projectPath: string
  projectName?: string
  agent: string
  status: AgentSkillStatus
  invalidateKey: unknown[]
}

function projectLabel(projectPath: string, projectName?: string): string {
  if (projectName) return projectName
  return projectPath.split(/[\\/]/).filter(Boolean).pop() ?? 'this project'
}

export default function AgentSkillControl({
  skillId,
  skillName,
  projectPath,
  projectName,
  agent,
  status,
  invalidateKey,
}: Props) {
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: (action: 'enable' | 'disable') => action === 'enable'
      ? enableSkill(skillId, projectPath, agent)
      : disableSkill(skillId, projectPath, agent),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: invalidateKey }),
        qc.invalidateQueries({ queryKey: ['skills'] }),
        qc.invalidateQueries({ queryKey: ['skill'] }),
        qc.invalidateQueries({ queryKey: ['project'] }),
        qc.invalidateQueries({ queryKey: ['overview'] }),
      ])
    },
  })

  const label = status.state === 'project'
    ? 'Project install'
    : status.state === 'global'
      ? 'Global install'
      : status.state === 'available'
        ? 'Available'
        : 'No source'
  const active = status.state === 'project' || status.state === 'global'
  const group = Array.from(new Set([agent, ...(status.sharedWith ?? [])]))
  const removalSummary = [
    `Remove ${skillName} from ${projectLabel(projectPath, projectName)}?`,
    `Agent group: ${group.join(', ')}.`,
    'This removes the project installation only; the Skill remains in the catalog.',
  ].join('\n\n')

  return (
    <div className="inline-flex min-w-40 flex-col items-center gap-1.5">
      <span
        className={`inline-flex min-w-32 items-center justify-center rounded-full border px-3 py-1 text-xs font-medium ${
          active
            ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
            : status.canEnable
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-gray-200 bg-gray-100 text-gray-500'
        }`}
        title={[`${label} for ${agent}`, status.reason, status.sharedWith?.length ? `Shared with: ${status.sharedWith.join(', ')}` : undefined].filter(Boolean).join(' | ')}
      >
        {label}
      </span>
      {status.canEnable && (
        <button
          onClick={() => mutation.mutate('enable')}
          disabled={mutation.isPending}
          className="text-xs font-medium text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? 'Installing...' : 'Install'}
        </button>
      )}
      {status.canDisable && (
        <button
          onClick={() => {
            if (!window.confirm(removalSummary)) return
            mutation.mutate('disable')
          }}
          disabled={mutation.isPending}
          className="text-xs font-medium text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? 'Removing...' : 'Remove from project'}
        </button>
      )}
      {status.state === 'global' && (
        <Link to={`/skills/${encodeURIComponent(skillId)}`} className="text-xs font-medium text-slate-600 hover:underline">
          Manage global
        </Link>
      )}
      {mutation.isError && (
        <span role="alert" className="max-w-48 text-xs text-red-700">
          {mutation.error instanceof Error ? mutation.error.message : 'Agent update failed.'}
        </span>
      )}
    </div>
  )
}
