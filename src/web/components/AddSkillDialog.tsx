import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addSkill } from '../api.js'
import { useI18n } from '../i18n/I18nProvider.js'

interface Props {
  onClose: () => void
  onInstalled?: () => void
}

export default function AddSkillDialog({ onClose, onInstalled }: Props) {
  const { localizeError, t } = useI18n()
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
        <h2 id="add-skill-title" className="text-lg font-semibold text-gray-900">{t('addSkill.title')}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {t('addSkill.help')}
        </p>
        <label htmlFor="skill-source" className="mt-4 block text-sm font-medium text-slate-800">{t('addSkill.sourceLabel')}</label>
        <input
          id="skill-source"
          autoFocus
          type="text"
          value={source}
          onChange={e => setSource(e.target.value)}
          placeholder={t('addSkill.placeholder')}
          className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p className="mt-1 text-xs text-slate-500">{t('addSkill.examples')}</p>
        {mutation.error && (
          <p role="alert" className="text-red-600 text-sm mt-2">{localizeError(mutation.error, 'addSkill.error')}</p>
        )}
        <div className="flex justify-end gap-3 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {t('addSkill.cancel')}
          </button>
          <button
            type="submit"
            disabled={!source || mutation.isPending}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {mutation.isPending ? t('addSkill.installing') : t('addSkill.install')}
          </button>
        </div>
      </form>
    </div>
  )
}
