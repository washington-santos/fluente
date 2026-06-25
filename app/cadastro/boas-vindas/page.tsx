'use client'

import { useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout'
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress'

export default function BoasVindasPage() {
  const { saveStep, loading } = useOnboardingProgress(1)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Nome é obrigatório'); return }
    setError(null)
    setSubmitting(true)

    const supabase = createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { error: updateError } = await supabase
        .from('users')
        .update({ name: name.trim() })
        .eq('id', user.id)
      if (updateError) {
        setError('Erro ao salvar o nome. Tente novamente.')
        setSubmitting(false)
        return
      }
    }

    await saveStep(1)
  }

  if (loading) return null

  return (
    <OnboardingLayout currentStep={1} title="Qual é o seu nome?" subtitle="Vamos te chamar pelo nome!">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <input
          type="text"
          placeholder="Seu nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark focus:outline-none focus:ring-2 focus:ring-brand-interactive"
        />
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-xl bg-brand-cta text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? 'Salvando...' : 'Continuar'}
        </button>
      </form>
    </OnboardingLayout>
  )
}
