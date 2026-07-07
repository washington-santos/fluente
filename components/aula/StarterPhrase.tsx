'use client'

import { Mic, MessageSquare } from 'lucide-react'

interface StarterPhraseProps {
  teacherFirstName: string
  phrase: string
  onUse: () => void
  onOther: () => void
  disabled: boolean
}

export function StarterPhrase({ phrase, onUse, onOther, disabled }: StarterPhraseProps) {
  return (
    <div className="w-full rounded-2xl bg-surface-light-card dark:bg-surface-dark-card p-4 flex flex-col gap-3">
      <p className="text-xs font-semibold text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
        💬 Primeira frase sugerida
      </p>

      <div className="px-4 py-3 rounded-xl bg-surface-light dark:bg-surface-dark border border-brand-interactive/30">
        <p className="text-base font-medium text-content-light dark:text-content-dark text-center">
          &ldquo;{phrase}&rdquo;
        </p>
      </div>

      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary text-center">
        Use essa frase para começar ou diga algo diferente
      </p>

      <div className="flex gap-2">
        <button
          onClick={onUse}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-cta text-content-dark font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <MessageSquare size={16} />
          Usar essa frase
        </button>
        <button
          onClick={onOther}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-brand-interactive text-brand-interactive font-semibold text-sm hover:bg-brand-interactive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Mic size={16} />
          Falar outra
        </button>
      </div>
    </div>
  )
}
