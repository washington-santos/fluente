'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase'

interface Props {
  userId: string
  email: string
  initialName: string
}

export function ProfileForm({ userId, email, initialName }: Props) {
  const [name, setName] = useState(initialName)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const changed = name.trim() !== initialName && name.trim().length > 0

  function handleSave() {
    if (!changed) return
    setError(null)
    setSuccess(false)

    startTransition(async () => {
      const supabase = createSupabaseClient()
      const { error: updateError } = await supabase
        .from('users')
        .update({ name: name.trim() })
        .eq('id', userId)

      if (updateError) {
        setError('Não foi possível salvar. Tente novamente.')
        return
      }

      setSuccess(true)
      router.refresh()
    })
  }

  return (
    <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-content-light dark:text-content-dark">Dados da conta</h2>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
          E-mail
        </label>
        <p className="text-sm text-content-light dark:text-content-dark">{email}</p>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="profile-name"
          className="text-xs text-content-light-secondary dark:text-content-dark-secondary"
        >
          Nome
        </label>
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setSuccess(false) }}
          maxLength={60}
          className="w-full rounded-lg border border-surface-light-card dark:border-surface-dark-card bg-surface-light dark:bg-surface-dark px-3 py-2 text-sm text-content-light dark:text-content-dark placeholder:text-content-light-secondary dark:placeholder:text-content-dark-secondary focus:outline-none focus:ring-2 focus:ring-brand-cta"
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-500">{error}</p>
      )}
      {success && (
        <p className="text-xs text-brand-cta">Nome atualizado!</p>
      )}

      <button
        onClick={handleSave}
        disabled={!changed || isPending}
        className="py-2.5 rounded-lg bg-brand-cta text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:pointer-events-none"
      >
        {isPending ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  )
}
