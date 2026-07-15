import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addSkill } from '../api.js'

interface Props {
  onClose: () => void
  onInstalled?: () => void
}

export default function AddSkillDialog({ onClose, onInstalled }: Props) {
  const [source, setSource] = useState('')
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => addSkill(source),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] })
      onInstalled?.()
      onClose()
    },
  })

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-skill-title"
      onKeyDown={event => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <form
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
        onSubmit={event => {
          event.preventDefault()
          if (source && !mutation.isPending) mutation.mutate()
        }}
      >
        <h2 id="add-skill-title" className="text-lg font-semibold text-gray-900">Install new Skill</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Discovers the source, adds its Skills to this catalog, and installs them globally to the enabled Global targets.
        </p>
        <label htmlFor="skill-source" className="mt-4 block text-sm font-medium text-slate-800">Skill source</label>
        <input
          id="skill-source"
          autoFocus
          type="text"
          value={source}
          onChange={e => setSource(e.target.value)}
          placeholder="owner/repo, GitHub URL, or local path"
          className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p className="mt-1 text-xs text-slate-500">Examples: owner/repo, a GitHub URL, or an absolute local path.</p>
        {mutation.error && (
          <p role="alert" className="text-red-600 text-sm mt-2">{(mutation.error as Error).message}</p>
        )}
        <div className="flex justify-end gap-3 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!source || mutation.isPending}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Installing...' : 'Install'}
          </button>
        </div>
      </form>
    </div>
  )
}
