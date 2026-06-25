'use client'

import { useState } from 'react'
import { Clock } from 'lucide-react'
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout'
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress'

const COMMITMENTS = [
  { value: '10min', label: '10 minutos por dia', desc: 'Ritmo leve — ótimo para começar' },
  { value: '20min', label: '20 minutos por dia', desc: 'Progresso consistente' },
  { value: '30min', label: '30 minutos por dia', desc: 'Evolução acelerada' },
]

export default function HorarioPage() {
  const { progress, saveStep, loading } = useOnboardingProgress(3)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleContinue() {
    if (!selected) { setError('Selecione uma opção'); return }
    setError(null)
    setSubmitting(true)
    const prev = progress?.written_answers ?? []
    await saveStep(3, { written_answers: [...prev, selected] })
  }

  if (loading) return null

  return (
    <OnboardingLayout currentStep={3} title="Quanto tempo por dia?" subtitle="Você pode ajustar isso depois.">
      <div className="space-y-3 mb-6">
        {COMMITMENTS.map(({ value, label, desc }) => (
          <button
            key={value}
            onClick={() => setSelected(value)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
              selected === value
                ? 'border-brand-interactive bg-brand-interactive/10 text-brand-interactive'
                : 'border-gray-200 dark:border-slate-700 text-content-light dark:text-content-dark hover:bg-surface-light-card dark:hover:bg-surface-dark-card'
            }`}
          >
            <Clock size={20} className="shrink-0" />
            <div>
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">{desc}</p>
            </div>
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-red-500 mb-3">{error}</p>}
      <button
        onClick={handleContinue}
        disabled={submitting}
        className="w-full py-3 rounded-xl bg-brand-cta text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {submitting ? 'Salvando...' : 'Continuar'}
      </button>
    </OnboardingLayout>
  )
}
