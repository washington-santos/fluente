'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface FreePracticeButtonProps {
  teacherId: string
}

export function FreePracticeButton({ teacherId }: FreePracticeButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleStart = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: teacherId, mode: 'free' }),
      })
      if (!res.ok) {
        setError('Erro ao iniciar. Tente novamente.')
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
        className="w-full py-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark font-semibold text-sm hover:opacity-80 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? 'Preparando...' : '💬 Prática livre'}
      </button>
      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
    </div>
  )
}
