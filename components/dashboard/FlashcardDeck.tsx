// components/dashboard/FlashcardDeck.tsx
'use client'

import { useState } from 'react'
import { CheckCircle } from 'lucide-react'

interface FlashCard {
  id: string
  error_type: string
  error_text: string
  correct_form: string
  review_count: number
}

interface FlashcardDeckProps {
  cards: FlashCard[]
  onReview: (errorId: string, knewIt: boolean, currentReviewCount: number) => void
  onComplete: () => void
}

export function FlashcardDeck({ cards, onReview, onComplete }: FlashcardDeckProps) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(false)

  if (done || cards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center" data-testid="review-complete">
        <CheckCircle size={48} className="text-green-500" />
        <h2 className="text-xl font-bold text-content-light dark:text-content-dark">Revisão concluída!</h2>
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
          Você revisou {cards.length} {cards.length === 1 ? 'erro' : 'erros'} hoje.
        </p>
      </div>
    )
  }

  const card = cards[index]

  function handleAnswer(knewIt: boolean) {
    onReview(card.id, knewIt, card.review_count)
    const next = index + 1
    if (next >= cards.length) {
      setDone(true)
      onComplete()
    } else {
      setIndex(next)
      setFlipped(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary text-center">
        {index + 1} de {cards.length}
      </p>

      <div className="rounded-2xl bg-surface-light-card dark:bg-surface-dark-card p-6 min-h-[160px] flex flex-col items-center justify-center gap-4 text-center">
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
          O que você disse
        </p>
        <p
          className="text-lg font-semibold text-content-light dark:text-content-dark italic"
          data-testid="flashcard-front"
        >
          {card.error_text}
        </p>

        {flipped && (
          <div data-testid="flashcard-back" className="w-full flex flex-col items-center gap-4">
            <div className="w-full h-px bg-surface-light dark:bg-surface-dark" />
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide">
              Forma correta
            </p>
            <p className="text-lg font-semibold text-green-600 dark:text-green-400">
              {card.correct_form}
            </p>
          </div>
        )}
      </div>

      {!flipped ? (
        <button
          onClick={() => setFlipped(true)}
          data-testid="btn-reveal"
          aria-label="Ver resposta"
          className="w-full py-3 rounded-xl bg-brand-interactive text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Ver resposta
        </button>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => handleAnswer(false)}
            data-testid="btn-didnt-know"
            aria-label="Não sabia"
            className="flex-1 py-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark font-semibold hover:opacity-80 transition-opacity"
          >
            Não sabia
          </button>
          <button
            onClick={() => handleAnswer(true)}
            data-testid="btn-knew"
            aria-label="Sabia"
            className="flex-1 py-3 rounded-xl bg-green-500 text-white font-semibold hover:opacity-90 transition-opacity"
          >
            Sabia!
          </button>
        </div>
      )}
    </div>
  )
}
