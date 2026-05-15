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
      ? 'Project install'
      : status.state === 'global'
        ? 'Global install'
        : status.state === 'available'
          ? 'Can install'
          : 'No source'
  const actionHint =
    status.state === 'project'
      ? 'Installed directly in this project. Click to uninstall from this project.'
      : status.state === 'global'
        ? 'Available here because it is installed globally. Manage it from the skill asset.'
        : status.state === 'available'
          ? 'Known asset with a reinstall source. Click to install into this project.'
          : 'Known asset, but skills-ui has no reinstall source for this target.'
  const titleParts = [
    `${label} for ${agent}`,
    actionHint,
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
      className={`inline-flex min-w-32 items-center justify-center rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
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
