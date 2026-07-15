'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { ExerciseFillBlankStep as StepType } from '@/types/lesson'

interface ExerciseFillBlankStepProps {
  step: StepType
  onSuccess: (isCorrect: boolean) => void
}

export function ExerciseFillBlankStep({ step, onSuccess }: ExerciseFillBlankStepProps) {
  const [value, setValue] = useState('')
  const [checked, setChecked] = useState(false)

  const isCorrect = value.trim().toLowerCase() === step.correct_answer.toLowerCase()
  const displaySentence = checked
    ? step.sentence_with_blank.replace('___', step.correct_answer)
    : step.sentence_with_blank

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="text-center">
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-2">
          Complete a frase
        </p>
        <p className="text-lg font-semibold text-content-light dark:text-content-dark">
          {displaySentence}
        </p>
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-2 italic">
          {step.sentence_pt_hint}
        </p>
      </div>

      {!checked && (
        <>
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Digite a palavra..."
            data-testid="fill-blank-input"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark text-center text-lg focus:outline-none focus:ring-2 focus:ring-brand-interactive"
          />
          <button
            onClick={() => setChecked(true)}
            disabled={!value.trim()}
            className="w-full py-4 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Verificar
          </button>
        </>
      )}

      {checked && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl text-center ${isCorrect ? 'bg-green-500/15' : 'bg-red-500/15'}`}
        >
          <p className="font-bold text-content-light dark:text-content-dark">
            {isCorrect ? '✅ Correto!' : `❌ Quase — a resposta certa é "${step.correct_answer}".`}
          </p>
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-1">
            {step.explanation_pt}
          </p>
        </motion.div>
      )}

      {checked && (
        <button
          onClick={() => onSuccess(isCorrect)}
          className="w-full py-4 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
        >
          Continuar →
        </button>
      )}
    </div>
  )
}
