'use client'

import { useState } from 'react'
import type { GeneratedLesson } from '@/types/lesson'
import { LessonProgressBar } from '@/components/lesson/LessonProgressBar'
import { WarmupReviewStep } from '@/components/lesson/WarmupReviewStep'
import { IntroStep } from '@/components/lesson/IntroStep'
import { SummaryStep } from '@/components/lesson/SummaryStep'
import { VocabPresentStep } from '@/components/lesson/VocabPresentStep'
import { VocabRepeatStep } from '@/components/lesson/VocabRepeatStep'
import { ExerciseChoiceStep } from '@/components/lesson/ExerciseChoiceStep'
import { ExerciseFillBlankStep } from '@/components/lesson/ExerciseFillBlankStep'
import { GuidedConvoStep } from '@/components/lesson/GuidedConvoStep'
import { ReviewStep } from '@/components/lesson/ReviewStep'

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

  const advance = (word?: string, score?: number) => {
    if (word !== undefined && score !== undefined) {
      setVocabScores(prev => ({ ...prev, [word]: score }))
    }
    const nextIndex = currentStepIndex + 1
    if (nextIndex >= lesson.steps.length) {
      setIsCompleted(true)
    } else {
      setCurrentStepIndex(nextIndex)
    }
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

  const step = lesson.steps[currentStepIndex]

  return (
    <div className="flex flex-col h-screen bg-surface-light dark:bg-surface-dark">
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
            {currentStepIndex + 1} / {lesson.steps.length}
          </p>
        </div>
        <LessonProgressBar currentIndex={currentStepIndex} total={lesson.steps.length} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {step.type === 'warmup_review' && (
          <WarmupReviewStep key={step.id} step={step} onContinue={() => advance()} />
        )}
        {step.type === 'intro' && (
          <IntroStep key={step.id} step={step} vocabulary={lesson.vocabulary} learningObjectives={lesson.learning_objectives} onContinue={() => advance()} />
        )}
        {step.type === 'vocab_present' && (
          <VocabPresentStep
            key={step.id}
            step={step}
            vocab={lesson.vocabulary[step.vocab_index]}
            ttsVoice={ttsVoice}
            onContinue={() => advance()}
          />
        )}
        {step.type === 'vocab_repeat' && (
          <VocabRepeatStep
            key={step.id}
            step={step}
            vocab={lesson.vocabulary[step.vocab_index]}
            onSuccess={(score: number) => advance(lesson.vocabulary[step.vocab_index].word, score)}
          />
        )}
        {step.type === 'exercise_choice' && (
          <ExerciseChoiceStep key={step.id} step={step} onSuccess={() => advance()} />
        )}
        {step.type === 'exercise_fill_blank' && (
          <ExerciseFillBlankStep key={step.id} step={step} onSuccess={() => advance()} />
        )}
        {step.type === 'guided_convo' && (
          <GuidedConvoStep
            key={step.id}
            step={step}
            sessionId={sessionId}
            teacherName={teacherName}
            teacherImageUrl={teacherImageUrl}
            ttsVoice={ttsVoice}
            onComplete={() => advance()}
          />
        )}
        {step.type === 'review' && (
          <ReviewStep key={step.id} step={step} vocabulary={lesson.vocabulary} onComplete={() => advance()} />
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
