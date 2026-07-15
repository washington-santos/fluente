'use client'

import { useEffect, useRef, useState } from 'react'
import type { VocabPresentStep as StepType, VocabItem, ExtraExample } from '@/types/lesson'

interface VocabPresentStepProps {
  step: StepType
  vocab: VocabItem
  ttsVoice: string
  strugglingMode?: boolean
  extraExample?: ExtraExample | null
  onContinue: () => void
}

export function VocabPresentStep({ step, vocab, ttsVoice, strugglingMode = false, extraExample = null, onContinue }: VocabPresentStepProps) {
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
      <span className="text-8xl" aria-hidden>{vocab.emoji}</span>
      <div className="text-center">
        <p className="text-5xl font-bold text-content-light dark:text-content-dark">{vocab.word}</p>
        <p className="text-base text-content-light-secondary dark:text-content-dark-secondary mt-2">
          {vocab.translation_pt}
        </p>
        <p className="text-sm text-brand-interactive font-mono mt-1">/{vocab.pronunciation_hint}/</p>
      </div>
      <div className="w-full p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-center">
        <p className="text-base text-content-light dark:text-content-dark">{step.example_sentence_en}</p>
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-1 italic">{step.example_sentence_pt}</p>
      </div>
      {extraExample && (
        <div className="w-full p-4 rounded-xl bg-brand-interactive/10 border border-brand-interactive/30 text-center">
          <p className="text-xs font-semibold text-brand-interactive mb-1">💡 Dica extra</p>
          <p className="text-sm text-content-light dark:text-content-dark">{extraExample.example_sentence_en}</p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary italic mt-1">{extraExample.example_sentence_pt}</p>
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-2">{extraExample.explanation_pt}</p>
        </div>
      )}
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
