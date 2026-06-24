'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout'
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress'
import { MCQ_QUESTIONS, scoreMcqs } from '@/lib/onboarding'

export default function NivelamentoPage() {
  const { progress, saveStep, loading } = useOnboardingProgress(4)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  async function handleOption(option: string) {
    const newAnswers = [...answers, option]
    setAnswers(newAnswers)

    if (newAnswers.length < MCQ_QUESTIONS.length) {
      setQuestionIndex((i) => i + 1)
      return
    }

    setSubmitting(true)
    const mcqLevel = scoreMcqs(newAnswers)
    const prev = progress?.written_answers ?? []
    await saveStep(4, {
      written_answers: [...prev, JSON.stringify(newAnswers), mcqLevel],
    })
    setSubmitting(false)
  }

  if (loading || submitting) {
    return (
      <OnboardingLayout currentStep={4} title="Avaliando seu inglês...">
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-4 border-brand-cta border-t-transparent rounded-full animate-spin" />
        </div>
      </OnboardingLayout>
    )
  }

  const question = MCQ_QUESTIONS[questionIndex]

  return (
    <OnboardingLayout
      currentStep={4}
      title="Teste rápido"
      subtitle={`Questão ${questionIndex + 1} de ${MCQ_QUESTIONS.length}`}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={questionIndex}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.25 }}
          className="space-y-3"
        >
          <p className="text-base font-medium text-content-light dark:text-content-dark mb-6">
            {question.text}
          </p>
          {question.options.map((option) => (
            <button
              key={option}
              onClick={() => handleOption(option)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 text-left text-content-light dark:text-content-dark hover:bg-surface-light-card dark:hover:bg-surface-dark-card hover:border-brand-interactive transition-colors"
            >
              {option}
            </button>
          ))}
        </motion.div>
      </AnimatePresence>
    </OnboardingLayout>
  )
}
