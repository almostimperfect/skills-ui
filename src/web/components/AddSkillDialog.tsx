import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addSkill } from '../api.js'

interface Props {
  onClose: () => void
}

export default function AddSkillDialog({ onClose }: Props) {
  const [source, setSource] = useState('')
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => addSkill(source),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Skill</h2>
        <input
          type="text"
          value={source}
          onChange={e => setSource(e.target.value)}
          placeholder="owner/repo, GitHub URL, or local path"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {mutation.error && (
          <p className="text-red-600 text-sm mt-2">{(mutation.error as Error).message}</p>
        )}
        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!source || mutation.isPending}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Installing...' : 'Install'}
          </button>
        </div>
      </div>
    </div>
  )
}
