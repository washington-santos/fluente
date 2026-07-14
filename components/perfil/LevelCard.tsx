'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { levelBelow } from '@/lib/levels'
import type { CefrLevel } from '@/types'

const LEVEL_LABELS: Record<CefrLevel, string> = {
  A1: 'A1 – Iniciante',
  A2: 'A2 – Básico',
  B1: 'B1 – Intermediário',
  B2: 'B2 – Intermediário avançado',
  C1: 'C1 – Avançado',
  C2: 'C2 – Proficiente',
}

interface Props {
  cefrLevel: CefrLevel
  reinforcementTargetLevel: CefrLevel | null
}

export function LevelCard({ cefrLevel, reinforcementTargetLevel }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const displayLevel = reinforcementTargetLevel ?? cefrLevel
  const lower = levelBelow(cefrLevel)

  async function handleConfirmDowngrade() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/level/downgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual_downgrade' }),
      })
      if (!res.ok) { setError('Não foi possível mudar de nível. Tente novamente.'); return }
      setConfirming(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card flex flex-col gap-2">
      <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">Seu nível atual</p>
      <p className="font-semibold text-content-light dark:text-content-dark">{LEVEL_LABELS[displayLevel]}</p>

      {reinforcementTargetLevel && (
        <p className="text-xs text-brand-interactive">
          Modo de estudo: Reforçando conteúdos do {cefrLevel}
        </p>
      )}

      {lower && !confirming && (
        <button
          onClick={() => setConfirming(true)}
          className="mt-2 text-xs text-content-light-secondary dark:text-content-dark-secondary underline hover:opacity-70 transition-opacity self-start"
        >
          Estudar um nível abaixo
        </button>
      )}

      {lower && confirming && (
        <div className="mt-2 p-3 rounded-lg bg-surface-light dark:bg-surface-dark flex flex-col gap-2">
          <p className="text-xs text-content-light dark:text-content-dark">
            Seu progresso será mantido — você vai reforçar o {lower} antes de voltar ao {cefrLevel}.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirmDowngrade}
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-brand-cta text-content-dark font-semibold text-xs hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {loading ? 'Salvando...' : `Confirmar ${lower}`}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={loading}
              className="flex-1 py-2 rounded-lg border border-surface-light-card dark:border-surface-dark-card text-xs text-content-light dark:text-content-dark hover:opacity-70 transition-opacity"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
