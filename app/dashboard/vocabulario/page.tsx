'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { VocabDeck } from '@/components/dashboard/VocabDeck'
import { ThemeToggle } from '@/components/ThemeToggle'

interface VocabCard {
  id: string
  word: string
  definition: string
  review_count: number
  next_review_at: string
}

export default function VocabularioPage() {
  const router = useRouter()
  const [cards, setCards] = useState<VocabCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/vocab')
      .then((r) => r.json())
      .then((data: { vocabCards: VocabCard[] }) => {
        setCards(data.vocabCards ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleReview = useCallback(async (vocabId: string, knewIt: boolean, reviewCount: number) => {
    await fetch('/api/vocab', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vocabId, knewIt, currentReviewCount: reviewCount }),
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

      <div className="flex-1 flex flex-col px-4 py-6 gap-6 max-w-sm mx-auto w-full">
        <h1 className="text-xl font-bold text-content-light dark:text-content-dark">
          Vocabulário
        </h1>

        {loading ? (
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary text-center py-12">
            Carregando...
          </p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary text-center py-12">
            Nenhuma palavra para revisar agora.
          </p>
        ) : (
          <VocabDeck
            cards={cards}
            onReview={handleReview}
            onComplete={() => router.push('/dashboard')}
          />
        )}
      </div>
    </main>
  )
}
