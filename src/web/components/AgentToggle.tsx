import { useMutation, useQueryClient } from '@tanstack/react-query'
import { enableSkill, disableSkill, type AgentSkillStatus } from '../api.js'

interface Props {
  skillId: string
  projectPath: string
  agent: string
  status: AgentSkillStatus
  invalidateKey: unknown[]
}

export default function AgentToggle({ skillId, projectPath, agent, status, invalidateKey }: Props) {
  const qc = useQueryClient()
  const toggle = useMutation({
    mutationFn: () =>
      status.canDisable
        ? disableSkill(skillId, projectPath, agent)
        : enableSkill(skillId, projectPath, agent),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: invalidateKey }),
        qc.invalidateQueries({ queryKey: ['skills'] }),
        qc.invalidateQueries({ queryKey: ['skill'] }),
        qc.invalidateQueries({ queryKey: ['project'] }),
      ])
    },
  })

  const interactive = status.canEnable || status.canDisable
  const active = status.state === 'project' || status.state === 'global'
  const label =
    status.state === 'project'
      ? 'Project'
      : status.state === 'global'
        ? 'Global'
        : status.state === 'available'
          ? 'Available'
          : 'Unavailable'
  const titleParts = [
    `${label} for ${agent}`,
    status.reason,
    status.sharedWith?.length ? `Shared with: ${status.sharedWith.join(', ')}` : undefined,
  ].filter(Boolean)

  return (
    <button
      onClick={() => {
        if (!interactive || toggle.isPending) return
        toggle.mutate()
      }}
      disabled={!interactive || toggle.isPending}
      className={`inline-flex min-w-24 items-center justify-center rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
          : interactive
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-gray-100 text-gray-500 border border-gray-200'
      }`}
      title={titleParts.join(' | ')}
    >
      {toggle.isPending ? 'Working...' : label}
    </button>
  )
}
