import { useMutation, useQueryClient } from '@tanstack/react-query'
import { enableSkill, disableSkill } from '../api.js'

interface Props {
  skillName: string
  projectPath: string
  agent: string
  status: 'enabled' | 'disabled'
  invalidateKey: unknown[]
}

export default function AgentToggle({ skillName, projectPath, agent, status, invalidateKey }: Props) {
  const qc = useQueryClient()
  const toggle = useMutation({
    mutationFn: () =>
      status === 'enabled'
        ? disableSkill(skillName, projectPath, agent)
        : enableSkill(skillName, projectPath, agent),
    onSuccess: () => qc.invalidateQueries({ queryKey: invalidateKey }),
  })

  const enabled = status === 'enabled'

  return (
    <button
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
        enabled ? 'bg-indigo-600' : 'bg-gray-300'
      }`}
      title={`${enabled ? 'Disable' : 'Enable'} for ${agent}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${
          enabled ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
