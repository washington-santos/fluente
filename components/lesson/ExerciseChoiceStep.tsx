'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { ExerciseChoiceStep as StepType } from '@/types/lesson'

interface ExerciseChoiceStepProps {
  step: StepType
  onSuccess: (isCorrect: boolean) => void
}

export function ExerciseChoiceStep({ step, onSuccess }: ExerciseChoiceStepProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const answered = selected !== null
  const isCorrect = selected === step.correct_answer

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="text-center">
        <span className="text-7xl" aria-hidden>{step.image_emoji}</span>
        <p className="text-xl font-bold text-content-light dark:text-content-dark mt-4">
          {step.question_pt}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {step.choices.map(choice => (
          <button
            key={choice}
            onClick={() => !answered && setSelected(choice)}
            disabled={answered}
            className={`p-4 rounded-xl font-semibold text-sm transition-all ${
              !answered
                ? 'bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark hover:bg-brand-interactive/20'
                : choice === step.correct_answer
                ? 'bg-green-500/25 text-content-light dark:text-content-dark'
                : choice === selected
                ? 'bg-red-500/25 text-content-light dark:text-content-dark'
                : 'bg-surface-light-card dark:bg-surface-dark-card text-content-light-secondary dark:text-content-dark-secondary opacity-50'
            }`}
          >
            {choice}
          </button>
        ))}
      </div>

      {answered && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl text-center ${isCorrect ? 'bg-green-500/15' : 'bg-red-500/15'}`}
        >
          <p className="font-bold text-content-light dark:text-content-dark">
            {isCorrect ? '✅ Correto!' : '❌ Não foi dessa vez.'}
          </p>
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-1">
            {step.explanation_pt}
          </p>
        </motion.div>
      )}

      {answered && (
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
