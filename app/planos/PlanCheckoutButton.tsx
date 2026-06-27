'use client'

import { useState } from 'react'
import type { PaidPlan } from '@/lib/mercadopago'

interface Props {
  plan: PaidPlan
  label: string
  highlight?: boolean
}

export function PlanCheckoutButton({ plan, label, highlight = false }: Props) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCheckout() {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })

      if (!res.ok) {
        setError('Não foi possível iniciar o pagamento. Tente novamente.')
        return
      }

      const data = (await res.json()) as { url: string }
      window.location.href = data.url
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={handleCheckout}
        disabled={isLoading}
        className={`py-3 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed ${
          highlight ? 'bg-white text-brand-cta' : 'bg-brand-cta text-white'
        }`}
      >
        {isLoading ? 'Aguarde...' : label}
      </button>
      {error && (
        <p className={`text-xs text-center ${highlight ? 'text-white/80' : 'text-red-500'}`}>
          {error}
        </p>
      )}
    </div>
  )
}
