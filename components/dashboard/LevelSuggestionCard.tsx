// components/dashboard/LevelSuggestionCard.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CefrLevel } from '@/types'

interface Props {
  currentLevel: CefrLevel
  lowerLevel: CefrLevel
}

export function LevelSuggestionCard({ currentLevel, lowerLevel }: Props) {
  const router = useRouter()
  const [hidden, setHidden] = useState(false)
  const [loading, setLoading] = useState<'accept' | 'dismiss' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleAccept() {
    setLoading('accept')
    setError(null)
    try {
      const res = await fetch('/api/level/downgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'confirmation_suggestion_accepted' }),
      })
      if (!res.ok) { setError('Não foi possível revisar o nível. Tente novamente.'); return }
      router.refresh()
    } finally {
      setLoading(null)
    }
  }

  async function handleDismiss() {
    setLoading('dismiss')
    setError(null)
    try {
      const res = await fetch('/api/level/dismiss-suggestion', { method: 'POST' })
      if (!res.ok) { setError('Não foi possível salvar. Tente novamente.'); return }
      setHidden(true)
    } finally {
      setLoading(null)
    }
  }

  if (hidden) return null

  return (
    <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card border border-brand-interactive/30 flex flex-col gap-3">
      <p className="text-sm font-semibold text-content-light dark:text-content-dark">
        Notamos que o {currentLevel} está sendo desafiador. Quer revisar o {lowerLevel} antes de continuar?
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleAccept}
          disabled={loading !== null}
          className="flex-1 py-2.5 rounded-lg bg-brand-cta text-content-dark font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {loading === 'accept' ? 'Revisando...' : `Revisar ${lowerLevel}`}
        </button>
        <button
          onClick={handleDismiss}
          disabled={loading !== null}
          className="flex-1 py-2.5 rounded-lg border border-surface-light-card dark:border-surface-dark-card text-sm text-content-light dark:text-content-dark hover:opacity-70 transition-opacity disabled:opacity-60"
        >
          {loading === 'dismiss' ? 'Salvando...' : `Continuar no ${currentLevel}`}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
