'use client'

import { motion } from 'framer-motion'

interface CorrectionCardProps {
  errorText: string
  correctForm: string
  errorType?: string | null
}

const ERROR_TYPE_LABEL: Record<string, string> = {
  verb_tense: 'tempo verbal',
  vocabulary: 'vocabulário',
  preposition: 'preposição',
  pronunciation: 'pronúncia',
  other: 'gramática',
}

export function CorrectionCard({ errorText, correctForm, errorType }: CorrectionCardProps) {
  const typeLabel = errorType ? ERROR_TYPE_LABEL[errorType] ?? 'gramática' : 'gramática'

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="mx-1 rounded-2xl border border-amber-300/50 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 p-3 flex flex-col gap-2"
      role="alert"
      aria-label="Correção"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-sm" role="img" aria-label="correção">✏️</span>
        <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
          Correção de {typeLabel}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-start gap-2">
          <span className="text-xs text-red-500 font-semibold shrink-0 mt-0.5">✗</span>
          <p className="text-sm text-content-light dark:text-content-dark line-through opacity-70">
            {errorText}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-xs text-green-500 font-semibold shrink-0 mt-0.5">✓</span>
          <p className="text-sm font-semibold text-content-light dark:text-content-dark">
            {correctForm}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
