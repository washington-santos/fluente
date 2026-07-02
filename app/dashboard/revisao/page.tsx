// app/dashboard/revisao/page.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { FlashcardDeck } from '@/components/dashboard/FlashcardDeck'
import { ThemeToggle } from '@/components/ThemeToggle'

interface FlashCard {
  id: string
  error_type: string
  error_text: string
  correct_form: string
  review_count: number
}

export default function RevisaoPage() {
  const router = useRouter()
  const [cards, setCards] = useState<FlashCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/flashcard')
      .then((r) => r.json())
      .then((data) => setCards(data.cards ?? []))
      .catch(() => setCards([]))
      .finally(() => setLoading(false))
  }, [])

  const handleReview = useCallback(async (errorId: string, knewIt: boolean, currentReviewCount: number) => {
    await fetch('/api/flashcard', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errorId, knewIt, currentReviewCount }),
    })
  }, [])

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-surface-light-card dark:border-surface-dark-card">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-sm text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity"
        >
          <ArrowLeft size={16} /> Dashboard
        </Link>
        <ThemeToggle />
      </header>

      <div className="flex-1 flex flex-col px-4 py-6 max-w-sm mx-auto w-full gap-4">
        <h1 className="text-xl font-bold text-content-light dark:text-content-dark">Revisar erros</h1>

        {loading ? (
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">Carregando...</p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">Nenhum erro para revisar</p>
        ) : (
          <FlashcardDeck
            cards={cards}
            onReview={handleReview}
            onComplete={() => router.push('/dashboard')}
          />
        )}
      </div>
    </main>
  )
}
