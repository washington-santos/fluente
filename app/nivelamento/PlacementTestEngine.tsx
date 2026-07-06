'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { PLACEMENT_QUESTIONS } from '@/content/placement-questions'
import { PlacementPhaseCard } from '@/components/placement/PlacementPhaseCard'
import { PlacementDiagnosticReport } from '@/components/placement/PlacementDiagnosticReport'
import type { PlacementAnswer, PlacementResult, LearningPlan, PlacementPhase } from '@/types'

interface PlacementTestEngineProps {
  teacherName: string
  teacherVoice: string
  userGoal: string
}

const PHASE_INTROS: Record<PlacementPhase, { emoji: string; title: string; subtitle: string }> = {
  listening:     { emoji: '👂', title: 'Compreensão Auditiva',  subtitle: 'Ouça a professora e responda em inglês.' },
  speaking:      { emoji: '🗣️', title: 'Fala',                 subtitle: 'Fale livremente — sem pressa.' },
  vocabulary:    { emoji: '📚', title: 'Vocabulário',           subtitle: 'Responda o que você vê.' },
  grammar:       { emoji: '✏️', title: 'Gramática',             subtitle: 'Responda as perguntas naturalmente.' },
  pronunciation: { emoji: '🎤', title: 'Pronúncia',             subtitle: 'Repita as palavras em voz alta.' },
}

type EnginePhase = 'intro' | 'phase_transition' | 'test' | 'completing' | 'done'

export function PlacementTestEngine({ teacherName, teacherVoice, userGoal }: PlacementTestEngineProps) {
  const router = useRouter()
  const [enginePhase, setEnginePhase] = useState<EnginePhase>('intro')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<PlacementAnswer[]>([])
  const [pendingPhase, setPendingPhase] = useState<PlacementPhase | null>(null)
  const [result, setResult] = useState<PlacementResult | null>(null)
  const [plan, setPlan] = useState<LearningPlan | null>(null)

  function startTest() {
    setEnginePhase('test')
  }

  function handlePhaseConfirm() {
    setEnginePhase('test')
  }

  async function handleAnswer(transcript: string, score: number) {
    const question = PLACEMENT_QUESTIONS[currentIndex]
    const newAnswers = [...answers, { question_id: question.id, phase: question.phase, transcript, score }]
    setAnswers(newAnswers)

    const nextIndex = currentIndex + 1

    if (nextIndex >= PLACEMENT_QUESTIONS.length) {
      setEnginePhase('completing')
      try {
        const res = await fetch('/api/placement/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: newAnswers, goal: userGoal }),
        })
        if (!res.ok) throw new Error('placement complete API error')
        const data = await res.json()
        setResult(data.result)
        setPlan(data.plan)
        setEnginePhase('done')
      } catch {
        router.push('/dashboard')
      }
      return
    }

    const nextQuestion = PLACEMENT_QUESTIONS[nextIndex]
    const phaseChanged = nextQuestion.phase !== question.phase

    setCurrentIndex(nextIndex)

    if (phaseChanged) {
      setPendingPhase(nextQuestion.phase)
      setEnginePhase('phase_transition')
    }
  }

  if (enginePhase === 'intro') {
    return (
      <div className="flex flex-col items-center gap-6 p-6 text-center">
        <p className="text-5xl" aria-hidden>🎯</p>
        <div>
          <h1 className="text-2xl font-bold text-content-light dark:text-content-dark">
            Avaliação de inglês
          </h1>
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-2">
            {teacherName} vai conversar com você em 10 perguntas.
            Leva cerca de 10 minutos. Sem pressão — fale naturalmente.
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full text-left">
          {(['listening', 'speaking', 'vocabulary', 'grammar', 'pronunciation'] as PlacementPhase[]).map(p => {
            const info = PHASE_INTROS[p]
            return (
              <div key={p} className="flex items-center gap-3 p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
                <span className="text-xl" aria-hidden>{info.emoji}</span>
                <span className="text-sm text-content-light dark:text-content-dark">{info.title}</span>
              </div>
            )
          })}
        </div>
        <button
          onClick={startTest}
          className="w-full py-4 rounded-xl bg-brand-cta text-content-dark font-bold text-lg hover:opacity-90 transition-opacity"
        >
          Começar avaliação →
        </button>
      </div>
    )
  }

  if (enginePhase === 'phase_transition' && pendingPhase) {
    const info = PHASE_INTROS[pendingPhase]
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-6 p-6 text-center"
      >
        <p className="text-5xl" aria-hidden>{info.emoji}</p>
        <div>
          <h2 className="text-xl font-bold text-content-light dark:text-content-dark">{info.title}</h2>
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-2">{info.subtitle}</p>
        </div>
        <button
          onClick={handlePhaseConfirm}
          className="w-full py-4 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
        >
          Continuar →
        </button>
      </motion.div>
    )
  }

  if (enginePhase === 'completing') {
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center">
        <div className="w-10 h-10 border-4 border-brand-cta border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
          Analisando seus resultados...
        </p>
      </div>
    )
  }

  if (enginePhase === 'done' && result && plan) {
    return (
      <PlacementDiagnosticReport
        result={result}
        plan={plan}
        onContinue={() => router.push('/dashboard')}
      />
    )
  }

  const question = PLACEMENT_QUESTIONS[currentIndex]

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={question.id}
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -30 }}
        transition={{ duration: 0.2 }}
      >
        <PlacementPhaseCard
          question={question}
          teacherVoice={teacherVoice}
          questionNumber={currentIndex + 1}
          totalQuestions={PLACEMENT_QUESTIONS.length}
          onAnswer={handleAnswer}
        />
      </motion.div>
    </AnimatePresence>
  )
}
