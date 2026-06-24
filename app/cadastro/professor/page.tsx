'use client'

import { useEffect, useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout'
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress'
import { combineLevels } from '@/lib/onboarding'
import { getTeacherForLevel, TEACHERS } from '@/config/teachers'
import type { CefrLevel } from '@/types'

const LEVEL_LABELS: Record<CefrLevel, string> = {
  A1: 'Iniciante',
  A2: 'Básico',
  B1: 'Intermediário',
  B2: 'Intermediário avançado',
  C1: 'Avançado',
  C2: 'Fluente',
}

export default function ProfessorPage() {
  const { progress, saveStep, loading } = useOnboardingProgress(6)
  const [finalLevel, setFinalLevel] = useState<CefrLevel | null>(null)
  const [teacherSlug, setTeacherSlug] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!progress) return
    const answers = progress.written_answers ?? []
    const mcqLevel = (answers[3] as CefrLevel | undefined) ?? 'A1'
    const voiceLevel = (answers[4] as CefrLevel | undefined) ?? mcqLevel
    const combined = combineLevels(mcqLevel, voiceLevel)
    setFinalLevel(combined)
    setTeacherSlug(getTeacherForLevel(combined))
  }, [progress])

  async function handleConfirm() {
    if (!finalLevel || !teacherSlug) return
    setSubmitting(true)

    const supabase = createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data: teacher } = await supabase
        .from('teachers')
        .select('id')
        .eq('slug', teacherSlug)
        .single()

      await supabase
        .from('users')
        .update({ cefr_level: finalLevel, teacher_id: teacher?.id ?? null })
        .eq('id', user.id)
    }

    await saveStep(6, { completed: true } as any)
    setSubmitting(false)
  }

  if (loading || !finalLevel || !teacherSlug) {
    return (
      <OnboardingLayout currentStep={6} title="Calculando seu nível...">
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-brand-cta border-t-transparent rounded-full animate-spin" />
        </div>
      </OnboardingLayout>
    )
  }

  const teacher = TEACHERS[teacherSlug]

  return (
    <OnboardingLayout currentStep={6} title="Seu perfil está pronto!">
      <div className="space-y-6">
        <div className="text-center py-4">
          <span className="inline-block px-4 py-1 rounded-full bg-brand-cta/20 text-brand-cta font-bold text-lg mb-1">
            {finalLevel}
          </span>
          <p className="text-content-light-secondary dark:text-content-dark-secondary text-sm">
            {LEVEL_LABELS[finalLevel]}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
          <p className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary mb-1">
            Seu professor
          </p>
          <p className="font-bold text-content-light dark:text-content-dark">{teacher.name}</p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-1">
            {teacher.levels.join(' · ')}
          </p>
        </div>

        <button
          onClick={handleConfirm}
          disabled={submitting}
          className="w-full py-3 rounded-xl bg-brand-cta text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? 'Salvando...' : 'Começar a aprender'}
        </button>
      </div>
    </OnboardingLayout>
  )
}
