'use client'

import { useEffect, useRef, useState } from 'react'
import type { ListeningPresentStep as StepType } from '@/types/lesson'

interface ListeningPresentStepProps {
  step: StepType
  ttsVoice: string
  strugglingMode?: boolean
  onContinue: () => void
}

export function ListeningPresentStep({ step, ttsVoice, strugglingMode = false, onContinue }: ListeningPresentStepProps) {
  const [isLoading, setIsLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const playTts = async () => {
    setIsLoading(true)
    try {
      const fd = new FormData()
      fd.append('text', step.teacher_script)
      fd.append('voice', ttsVoice)
      fd.append('speed', strugglingMode ? '0.85' : '1.0')
      const res = await fetch('/api/lesson/tts', { method: 'POST', body: fd })
      const { audio_url } = await res.json()
      const audio = new Audio(audio_url)
      audioRef.current = audio
      await audio.play()
    } catch {
      // TTS failure is non-blocking
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    playTts()
    return () => { audioRef.current?.pause() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id])

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <span className="text-6xl" aria-hidden>🎧</span>
      <div className="text-center">
        <p className="text-xs font-semibold text-brand-interactive uppercase tracking-wide mb-2">Listening</p>
        <p className="text-base text-content-light dark:text-content-dark">
          Ouça com atenção. Você vai responder perguntas sobre o que ouviu.
        </p>
      </div>
      <button
        onClick={playTts}
        disabled={isLoading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark text-sm hover:opacity-80 transition-opacity disabled:opacity-50"
        aria-label="Ouvir novamente"
      >
        🔊 {isLoading ? 'Carregando...' : 'Ouvir novamente'}
      </button>
      <button
        onClick={onContinue}
        className="w-full py-4 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
      >
        Entendi! Continuar →
      </button>
    </div>
  )
}
