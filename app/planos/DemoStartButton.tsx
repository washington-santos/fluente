'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DemoStatus } from '@/types'

interface Props {
  demoStatus: DemoStatus | null
}

export function DemoStartButton({ demoStatus }: Props) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (demoStatus === 'active') {
    return (
      <div className="py-3 rounded-xl text-center text-sm font-semibold text-brand-interactive bg-brand-interactive/10 border border-brand-interactive/30">
        Demonstração ativa
      </div>
    )
  }

  if (demoStatus === 'expired' || demoStatus === 'exhausted') {
    return (
      <div className="py-3 rounded-xl text-center text-sm font-semibold text-content-light-secondary dark:text-content-dark-secondary border border-surface-light-card dark:border-surface-dark-card cursor-not-allowed opacity-60">
        Demonstração encerrada
      </div>
    )
  }

  async function handleStart() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/demo/start', { method: 'POST' })
      if (!res.ok) {
        setError('Não foi possível iniciar a demonstração.')
        return
      }
      router.push('/dashboard')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={handleStart}
        disabled={isLoading}
        className="py-3 rounded-xl font-semibold text-sm border border-brand-interactive text-content-light dark:text-content-dark hover:bg-brand-interactive/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Aguarde...' : 'Começar demonstração'}
      </button>
      {error && <p className="text-xs text-center text-red-500">{error}</p>}
    </div>
  )
}
