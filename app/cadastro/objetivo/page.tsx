'use client'

import { useState } from 'react'
import { Briefcase, Plane, BookOpen, Heart } from 'lucide-react'
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout'
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress'

const GOALS = [
  { value: 'trabalho', label: 'Trabalho', icon: Briefcase, desc: 'Reuniões, e-mails, entrevistas' },
  { value: 'viagem', label: 'Viagem', icon: Plane, desc: 'Turismo e aventuras pelo mundo' },
  { value: 'estudos', label: 'Estudos', icon: BookOpen, desc: 'Faculdade, intercâmbio, certificados' },
  { value: 'pessoal', label: 'Pessoal', icon: Heart, desc: 'Filmes, música e cultura' },
]

export default function ObjetivoPage() {
  const { saveStep, loading } = useOnboardingProgress(2)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleContinue() {
    if (!selected) { setError('Selecione um objetivo'); return }
    setError(null)
    setSubmitting(true)
    await saveStep(2, { written_answers: [selected] })
    setSubmitting(false)
  }

  if (loading) return null

  return (
    <OnboardingLayout currentStep={2} title="Qual é o seu objetivo?" subtitle="Isso nos ajuda a personalizar suas aulas.">
      <div className="space-y-3 mb-6">
        {GOALS.map(({ value, label, icon: Icon, desc }) => (
          <button
            key={value}
            onClick={() => setSelected(value)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
              selected === value
                ? 'border-brand-interactive bg-brand-interactive/10 text-brand-interactive'
                : 'border-gray-200 dark:border-slate-700 text-content-light dark:text-content-dark hover:bg-surface-light-card dark:hover:bg-surface-dark-card'
            }`}
          >
            <Icon size={20} className="shrink-0" />
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
