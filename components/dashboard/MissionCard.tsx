'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle } from 'lucide-react'

interface DailyMission {
  missionKey: string
  titlePt: string
  descriptionPt: string
  minUserTurns: number
  completed: boolean
}

export function MissionCard() {
  const router = useRouter()
  const [mission, setMission] = useState<DailyMission | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    fetch('/api/mission')
      .then((res) => res.json())
      .then((data: { mission: DailyMission }) => {
        if (mounted) setMission(data.mission)
      })
      .catch(() => {
        if (mounted) setError('Não foi possível carregar a missão.')
      })
    return () => { mounted = false }
  }, [])

  async function handleStart() {
    setStarting(true)
    setError(null)
    try {
      const res = await fetch('/api/mission/start', { method: 'POST' })
      if (!res.ok) {
        setError('Erro ao iniciar aula. Tente novamente.')
        return
      }
      router.push('/aula')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setStarting(false)
    }
  }

  if (!mission) {
    return <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card h-20 animate-pulse" />
  }

  const completed = mission.completed

  return (
    <div className={`p-4 rounded-xl flex flex-col gap-3 ${
      completed
        ? 'bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900'
        : 'bg-surface-light-card dark:bg-surface-dark-card'
    }`}>
      <div className="flex items-start gap-3">
        <CheckCircle
          size={20}
          className={`mt-0.5 flex-shrink-0 ${
            completed ? 'text-green-500' : 'text-content-light-secondary dark:text-content-dark-secondary opacity-30'
          }`}
        />
        <div>
          <p className={`text-sm font-semibold ${
            completed ? 'text-green-700 dark:text-green-400' : 'text-content-light dark:text-content-dark'
          }`}>
            {completed ? 'Missão concluída — ' : ''}{mission.titlePt}
          </p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-0.5">
            {mission.descriptionPt}
          </p>
        </div>
      </div>

      {!completed && (
        <button
          onClick={handleStart}
          disabled={starting}
          className="w-full py-2.5 rounded-lg bg-brand-cta text-content-dark font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {starting ? 'Preparando...' : 'Começar aula focada →'}
        </button>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
