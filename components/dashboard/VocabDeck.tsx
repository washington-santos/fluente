'use client'

import { useState } from 'react'

interface VocabCard {
  id: string
  word: string
  definition: string
  review_count: number
  next_review_at: string
}

interface VocabDeckProps {
  cards: VocabCard[]
  onReview: (vocabId: string, knewIt: boolean, reviewCount: number) => Promise<void>
  onComplete: () => void
}

export function VocabDeck({ cards, onReview, onComplete }: VocabDeckProps) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(false)

  const card = cards[index]

  async function handleReview(knewIt: boolean) {
    await onReview(card.id, knewIt, card.review_count)
    const next = index + 1
    if (next >= cards.length) {
      setDone(true)
      onComplete()
    } else {
      setIndex(next)
      setRevealed(false)
    }
  }

  if (done) {
    return (
      <div data-testid="review-complete" className="flex flex-col items-center gap-4 py-12">
        <p className="text-lg font-semibold text-content-light dark:text-content-dark">
          Revisão concluída!
        </p>
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
          Todas as palavras foram revisadas.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary text-center">
        {index + 1} de {cards.length}
      </p>

      <div className="rounded-2xl bg-surface-light-card dark:bg-surface-dark-card p-6 min-h-[160px] flex flex-col items-center justify-center gap-4">
        <p data-testid="vocab-front" className="text-2xl font-bold text-content-light dark:text-content-dark text-center">
          {card.word}
        </p>

        {revealed && (
          <p data-testid="vocab-back" className="text-sm text-content-light-secondary dark:text-content-dark-secondary text-center">
            {card.definition}
          </p>
        )}
      </div>

      {!revealed ? (
        <button
          data-testid="btn-reveal"
          onClick={() => setRevealed(true)}
          className="w-full py-3 rounded-xl bg-brand-interactive text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Ver definição
        </button>
      ) : (
        <div className="flex gap-3">
          <button
            data-testid="btn-didnt-know"
            onClick={() => handleReview(false)}
            className="flex-1 py-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark font-semibold hover:opacity-80 transition-opacity"
          >
            Não sabia
          </button>
          <button
            data-testid="btn-knew"
            onClick={() => handleReview(true)}
            className="flex-1 py-3 rounded-xl bg-brand-cta text-white font-semibold hover:opacity-90 transition-opacity"
          >
            Sabia!
          </button>
        </div>
      )}
    </div>
  )
}
