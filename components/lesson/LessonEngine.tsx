'use client'

import { useEffect, useState } from 'react'
import type { GeneratedLesson, LessonStep, ExtraExample } from '@/types/lesson'
import { LessonProgressBar } from '@/components/lesson/LessonProgressBar'
import { WarmupReviewStep } from '@/components/lesson/WarmupReviewStep'
import { IntroStep } from '@/components/lesson/IntroStep'
import { GrammarPresentStep } from '@/components/lesson/GrammarPresentStep'
import { ListeningPresentStep } from '@/components/lesson/ListeningPresentStep'
import { SummaryStep } from '@/components/lesson/SummaryStep'
import { VocabPresentStep } from '@/components/lesson/VocabPresentStep'
import { VocabRepeatStep } from '@/components/lesson/VocabRepeatStep'
import { ExerciseChoiceStep } from '@/components/lesson/ExerciseChoiceStep'
import { ExerciseFillBlankStep } from '@/components/lesson/ExerciseFillBlankStep'
import { GuidedConvoStep } from '@/components/lesson/GuidedConvoStep'
import { ReviewStep } from '@/components/lesson/ReviewStep'
import { shouldEnterStruggleMode } from '@/lib/adaptive-difficulty'
import { getNpcByKey } from '@/lib/npcs'

interface LessonEngineProps {
  lesson: GeneratedLesson
  sessionId: string
  teacherName: string
  teacherImageUrl: string
  ttsVoice: string
  onComplete: () => void
}

export function LessonEngine({ lesson, sessionId, teacherName, teacherImageUrl, ttsVoice, onComplete }: LessonEngineProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [vocabScores, setVocabScores] = useState<Record<string, number>>({})
  const [isCompleted, setIsCompleted] = useState(false)
  const [steps, setSteps] = useState<LessonStep[]>(lesson.steps)
  const [struggleEvents, setStruggleEvents] = useState(0)
  const [strugglingMode, setStrugglingMode] = useState(false)
  const [extraExample, setExtraExample] = useState<(ExtraExample & { word: string }) | null>(null)

  const introStep = lesson.steps.find((s): s is import('@/types/lesson').IntroStep => s.type === 'intro')
  const npc = introStep?.npc_key ? getNpcByKey(introStep.npc_key) : null
  const displayTeacherName = npc?.name ?? teacherName

  // Applies the one-time structural adaptations (shorter dialogues ahead, an
  // extra worked example for the next new word) exactly once, right when
  // struggling mode first turns on.
  useEffect(() => {
    if (!strugglingMode) return

    setSteps(prevSteps => prevSteps.map((s, i) => {
      if (i <= currentStepIndex) return s
      return s.type === 'guided_convo' ? { ...s, min_exchanges: Math.max(1, s.min_exchanges - 1) } : s
    }))

    let nextVocabWord: string | null = null
    for (const s of steps.slice(currentStepIndex + 1)) {
      if (s.type === 'vocab_present') { nextVocabWord = lesson.vocabulary[s.vocab_index].word; break }
    }
    if (nextVocabWord) {
      const word = nextVocabWord
      fetch('/api/lesson/extra-example', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word }),
      })
        .then(res => (res.ok ? res.json() : null))
        .then(data => { if (data) setExtraExample({ word, ...data }) })
        .catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strugglingMode])

  const registerStruggleEvent = (): boolean => {
    const next = struggleEvents + 1
    setStruggleEvents(next)
    const enteringNow = !strugglingMode && shouldEnterStruggleMode(next)
    if (enteringNow) setStrugglingMode(true)
    return strugglingMode || enteringNow
  }

  const advance = (word?: string, score?: number) => {
    if (word !== undefined && score !== undefined) {
      setVocabScores(prev => ({ ...prev, [word]: score }))
    }
    const nextIndex = currentStepIndex + 1
    if (nextIndex >= steps.length) {
      setIsCompleted(true)
    } else {
      setCurrentStepIndex(nextIndex)
    }
  }

  const advanceExercise = (isCorrect: boolean) => {
    if (!isCorrect) {
      const active = registerStruggleEvent()
      if (active) {
        const current = steps[currentStepIndex]
        const clone: LessonStep = { ...current, id: `${current.id}-retry` }
        setSteps(prevSteps => {
          const next = [...prevSteps]
          next.splice(currentStepIndex + 1, 0, clone)
          return next
        })
      }
    }
    advance()
  }

  if (isCompleted) {
    return (
      <div className="min-h-screen bg-surface-light dark:bg-surface-dark overflow-y-auto">
        <SummaryStep
          vocabulary={lesson.vocabulary}
          vocabScores={vocabScores}
          learningObjectives={lesson.learning_objectives}
          xpEarned={0}
          lessonTitle={lesson.title_pt}
          onFinish={onComplete}
        />
      </div>
    )
  }

  const step = steps[currentStepIndex]

  return (
    <div className="flex flex-col h-screen bg-surface-light dark:bg-surface-dark">
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
            {currentStepIndex + 1} / {steps.length}
          </p>
        </div>
        <LessonProgressBar currentIndex={currentStepIndex} total={steps.length} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {step.type === 'warmup_review' && (
          <WarmupReviewStep key={step.id} step={step} onContinue={() => advance()} />
        )}
        {step.type === 'intro' && (
          <IntroStep key={step.id} step={step} vocabulary={lesson.vocabulary} learningObjectives={lesson.learning_objectives} onContinue={() => advance()} />
        )}
        {step.type === 'grammar_present' && (
          <GrammarPresentStep
            key={step.id}
            step={step}
            ttsVoice={ttsVoice}
            strugglingMode={strugglingMode}
            onContinue={() => advance()}
          />
        )}
        {step.type === 'vocab_present' && (
          <VocabPresentStep
            key={step.id}
            step={step}
            vocab={lesson.vocabulary[step.vocab_index]}
            ttsVoice={ttsVoice}
            strugglingMode={strugglingMode}
            extraExample={extraExample?.word === lesson.vocabulary[step.vocab_index].word ? extraExample : null}
            onContinue={() => advance()}
          />
        )}
        {step.type === 'vocab_repeat' && (
          <VocabRepeatStep
            key={step.id}
            step={step}
            vocab={lesson.vocabulary[step.vocab_index]}
            onSuccess={(score: number) => {
              if (score < 0.6) registerStruggleEvent()
              advance(lesson.vocabulary[step.vocab_index].word, score)
            }}
          />
        )}
        {step.type === 'listening_present' && (
          <ListeningPresentStep
            key={step.id}
            step={step}
            ttsVoice={ttsVoice}
            strugglingMode={strugglingMode}
            onContinue={() => advance()}
          />
        )}
        {step.type === 'exercise_choice' && (
          <ExerciseChoiceStep key={step.id} step={step} onSuccess={(isCorrect: boolean) => advanceExercise(isCorrect)} />
        )}
        {step.type === 'exercise_fill_blank' && (
          <ExerciseFillBlankStep key={step.id} step={step} onSuccess={(isCorrect: boolean) => advanceExercise(isCorrect)} />
        )}
        {step.type === 'guided_convo' && (
          <GuidedConvoStep
            key={step.id}
            step={step}
            sessionId={sessionId}
            teacherName={displayTeacherName}
            teacherImageUrl={teacherImageUrl}
            ttsVoice={ttsVoice}
            strugglingMode={strugglingMode}
            onComplete={(correctionRate: number) => {
              if (correctionRate > 0.5) registerStruggleEvent()
              advance()
            }}
          />
        )}
        {step.type === 'review' && (
          <ReviewStep key={step.id} step={step} vocabulary={lesson.vocabulary} strugglingMode={strugglingMode} onComplete={() => advance()} />
        )}
        {step.type === 'summary' && (
          <SummaryStep
            key={step.id}
            vocabulary={lesson.vocabulary}
            vocabScores={vocabScores}
            learningObjectives={lesson.learning_objectives}
            xpEarned={0}
            lessonTitle={lesson.title_pt}
            onFinish={onComplete}
          />
        )}
      </div>
    </div>
  )
}
