'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function StartLessonButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleStart = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/lesson/generate', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(data.error ?? 'Erro ao iniciar aula. Tente novamente.')
        return
      }
      router.push('/aula')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleStart}
        disabled={loading}
        className="w-full py-4 rounded-xl bg-brand-cta text-content-dark font-bold text-base hover:opacity-90 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? 'Preparando sua aula... ✨' : 'Iniciar Aula com IA ✨'}
      </button>
      {error && (
        <p className="text-xs text-red-400 text-center">{error}</p>
      )}
    </div>
  )
}
