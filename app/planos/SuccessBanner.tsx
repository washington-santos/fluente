'use client'

import { useSearchParams } from 'next/navigation'

export function SuccessBanner() {
  const params = useSearchParams()
  if (params.get('status') !== 'approved') return null

  return (
    <div className="mb-6 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-center">
      <p className="font-semibold text-green-700 dark:text-green-400 text-sm">
        Pagamento aprovado!
      </p>
      <p className="text-xs text-green-600 dark:text-green-500 mt-1">
        Sua assinatura será ativada em instantes. Obrigado!
      </p>
    </div>
  )
}
