'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase'

const TEACHER_META: Record<string, { initials: string; level: string; origin: string; bg: string }> = {
  'mrs-carol':   { initials: 'MC', level: 'A1 – A2', origin: 'Americana · Sotaque neutro', bg: 'bg-brand-interactive' },
  'mr-jake':     { initials: 'MJ', level: 'B1 – B2', origin: 'Californiano · Informal',    bg: 'bg-brand-cta' },
  'dr-reynolds': { initials: 'DR', level: 'B2 – C1', origin: 'Britânico · Formal',         bg: 'bg-brand-primary' },
  'sofia':       { initials: 'S',  level: 'B1 – C1', origin: 'Americana · Enérgica',       bg: 'bg-brand-streak' },
}

interface Teacher {
  id: string
  slug: string
  name: string
  correction_style: string | null
}

interface Props {
  teachers: Teacher[]
  currentTeacherId: string
  userId: string
}

export function TeacherSwitcher({ teachers, currentTeacherId, userId }: Props) {
  const [selected, setSelected] = useState(currentTeacherId)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const changed = selected !== currentTeacherId

  async function handleSave() {
    if (!changed) return
    setError(null)
    setSuccess(false)

    startTransition(async () => {
      const supabase = createSupabaseClient()
      const { error: updateError } = await supabase
        .from('users')
        .update({ teacher_id: selected })
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
    <div className="flex flex-col gap-3">
      {teachers.map((t) => {
        const meta = TEACHER_META[t.slug] ?? { initials: t.name[0], level: '', origin: '', bg: 'bg-brand-interactive' }
        const isSelected = selected === t.id

        return (
          <button
            key={t.id}
            onClick={() => { setSelected(t.id); setSuccess(false) }}
            className={`flex items-center gap-4 p-4 rounded-xl text-left transition-all ${
              isSelected
                ? 'bg-brand-cta/10 ring-2 ring-brand-cta'
                : 'bg-surface-light-card dark:bg-surface-dark-card hover:opacity-80'
            }`}
          >
            <div
              className={`w-12 h-12 rounded-full ${meta.bg} text-white font-bold text-base flex items-center justify-center shrink-0`}
            >
              {meta.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-content-light dark:text-content-dark">{t.name}</p>
              <p className="text-xs text-brand-interactive font-medium">{meta.level}</p>
              <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">{meta.origin}</p>
            </div>
            {isSelected && (
              <div className="w-5 h-5 rounded-full bg-brand-cta flex items-center justify-center shrink-0">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </button>
        )
      })}

      {error && (
        <p role="alert" className="text-xs text-red-500 text-center">{error}</p>
      )}
      {success && (
        <p className="text-xs text-brand-cta text-center">Professor atualizado!</p>
      )}

      <button
        onClick={handleSave}
        disabled={!changed || isPending}
        className="mt-2 py-3 rounded-xl bg-brand-cta text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:pointer-events-none"
      >
        {isPending ? 'Salvando...' : 'Salvar professor'}
      </button>
    </div>
  )
}
