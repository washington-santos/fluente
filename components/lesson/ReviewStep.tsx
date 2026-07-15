'use client'

import { useState } from 'react'
import type { ReviewStep as StepType, VocabItem } from '@/types/lesson'

interface ReviewStepProps {
  step: StepType
  vocabulary: VocabItem[]
  strugglingMode?: boolean
  onComplete: () => void
}

export function ReviewStep({ step, vocabulary, strugglingMode = false, onComplete }: ReviewStepProps) {
  const [cardIndex, setCardIndex] = useState(0)
  const [revealed, setRevealed] = useState(strugglingMode)
  const [knewCount, setKnewCount] = useState(0)
  const [done, setDone] = useState(false)

  const current = vocabulary[cardIndex]
  const isLast = cardIndex === vocabulary.length - 1

  const mark = (knew: boolean) => {
    if (knew) setKnewCount(c => c + 1)
    if (isLast) {
      setDone(true)
    } else {
      setCardIndex(i => i + 1)
      setRevealed(strugglingMode)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 p-4">
      <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary text-center">
        {step.instruction_pt}
      </p>

      {!done ? (
        <>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
            {cardIndex + 1} / {vocabulary.length}
          </p>
          <div className="w-full p-8 rounded-2xl bg-surface-light-card dark:bg-surface-dark-card text-center min-h-[200px] flex flex-col items-center justify-center gap-4">
            <span className="text-6xl" aria-hidden>{current.emoji}</span>
            <p className="text-4xl font-bold text-content-light dark:text-content-dark">{current.word}</p>
            {revealed && (
              <p className="text-xl text-brand-interactive font-semibold">{current.translation_pt}</p>
            )}
          </div>

          {!revealed ? (
            <button
              onClick={() => setRevealed(true)}
              className="w-full py-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark font-semibold hover:opacity-80 transition-opacity"
            >
              Ver tradução
            </button>
          ) : (
            <div className="flex gap-3 w-full">
              <button
                onClick={() => mark(false)}
                className="flex-1 py-3 rounded-xl bg-red-500/20 text-content-light dark:text-content-dark font-semibold hover:opacity-80 transition-opacity"
              >
                ❌ Não sabia
              </button>
              <button
                onClick={() => mark(true)}
                className="flex-1 py-3 rounded-xl bg-green-500/20 text-content-light dark:text-content-dark font-semibold hover:opacity-80 transition-opacity"
              >
                ✅ Sabia!
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="text-center">
            <p className="text-5xl" aria-hidden>🎉</p>
            <p className="text-2xl font-bold text-content-light dark:text-content-dark mt-4">
              Revisão completa!
            </p>
            <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-2">
              Você sabia {knewCount} de {vocabulary.length} palavras
            </p>
          </div>
          <button
            onClick={onComplete}
            className="w-full py-4 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
          >
            Ver resumo →
          </button>
        </>
      )}
    </div>
  )
}
