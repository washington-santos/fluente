'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { LessonContent, UserLessonProgress } from '@/types/lesson'
import { LessonProgressBar } from '@/components/lesson/LessonProgressBar'
import { IntroStep } from '@/components/lesson/IntroStep'
import { SummaryStep } from '@/components/lesson/SummaryStep'
import { VocabPresentStep } from '@/components/lesson/VocabPresentStep'
import { VocabRepeatStep } from '@/components/lesson/VocabRepeatStep'
import { ExerciseChoiceStep } from '@/components/lesson/ExerciseChoiceStep'
import { GuidedConvoStep } from '@/components/lesson/GuidedConvoStep'
import { ReviewStep } from '@/components/lesson/ReviewStep'

interface LessonEngineProps {
  lesson: LessonContent
  initialProgress: UserLessonProgress | null
  teacherName: string
  teacherImageUrl: string
  ttsVoice: string
}

export function LessonEngine({ lesson, initialProgress, teacherName, teacherImageUrl, ttsVoice }: LessonEngineProps) {
  const router = useRouter()
  const [currentStepIndex, setCurrentStepIndex] = useState(initialProgress?.current_step_index ?? 0)
  const [vocabScores, setVocabScores] = useState<Record<string, number>>(initialProgress?.vocab_scores ?? {})
  const [xpEarned, setXpEarned] = useState(0)
  const [isCompleted, setIsCompleted] = useState(false)

  const saveProgress = useCallback(async (stepIndex: number, word?: string, score?: number) => {
    await fetch('/api/lesson/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson_slug: lesson.slug, step_index: stepIndex, word, score }),
    })
  }, [lesson.slug])

  const advance = useCallback(async (word?: string, score?: number) => {
    const nextIndex = currentStepIndex + 1
    const newScores = word !== undefined && score !== undefined
      ? { ...vocabScores, [word]: score }
      : vocabScores
    if (word !== undefined && score !== undefined) setVocabScores(newScores)

    if (nextIndex >= lesson.steps.length) {
      const res = await fetch('/api/lesson/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson_slug: lesson.slug, vocab_scores: newScores }),
      })
      const data = await res.json()
      setXpEarned(data.xp_earned ?? lesson.xp_reward)
      setIsCompleted(true)
    } else {
      await saveProgress(nextIndex, word, score)
      setCurrentStepIndex(nextIndex)
    }
  }, [currentStepIndex, vocabScores, lesson, saveProgress])

  if (isCompleted) {
    return (
      <div className="min-h-screen bg-surface-light dark:bg-surface-dark overflow-y-auto">
        <SummaryStep
          vocabulary={lesson.vocabulary}
          vocabScores={vocabScores}
          xpEarned={xpEarned}
          lessonTitle={lesson.title_pt}
          onFinish={() => router.push('/licoes')}
        />
      </div>
    )
  }

  const step = lesson.steps[currentStepIndex]

  return (
    <div className="flex flex-col h-screen bg-surface-light dark:bg-surface-dark">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => router.push('/licoes')}
            className="text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity"
            aria-label="Sair da lição"
          >
            ✕ Sair
          </button>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
            {currentStepIndex + 1} / {lesson.steps.length}
          </p>
        </div>
        <LessonProgressBar currentIndex={currentStepIndex} total={lesson.steps.length} />
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto">
        {step.type === 'intro' && (
          <IntroStep step={step} vocabulary={lesson.vocabulary} onContinue={() => advance()} />
        )}
        {step.type === 'vocab_present' && (
          <VocabPresentStep
            step={step}
            vocab={lesson.vocabulary[step.vocab_index]}
            ttsVoice={ttsVoice}
            onContinue={() => advance()}
          />
        )}
        {step.type === 'vocab_repeat' && (
          <VocabRepeatStep
            step={step}
            vocab={lesson.vocabulary[step.vocab_index]}
            onSuccess={(score: number) => advance(lesson.vocabulary[step.vocab_index].word, score)}
          />
        )}
        {step.type === 'exercise_choice' && (
          <ExerciseChoiceStep step={step} onSuccess={() => advance()} />
        )}
        {step.type === 'guided_convo' && (
          <GuidedConvoStep
            step={step}
            teacherName={teacherName}
            teacherImageUrl={teacherImageUrl}
            ttsVoice={ttsVoice}
            onComplete={() => advance()}
          />
        )}
        {step.type === 'review' && (
          <ReviewStep step={step} vocabulary={lesson.vocabulary} onComplete={() => advance()} />
        )}
        {step.type === 'summary' && (
          <SummaryStep
            vocabulary={lesson.vocabulary}
            vocabScores={vocabScores}
            xpEarned={xpEarned}
            lessonTitle={lesson.title_pt}
            onFinish={() => advance()}
          />
        )}
      </div>
    </div>
  )
}
