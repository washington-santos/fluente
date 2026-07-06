'use client'

import { useEffect, useRef, useState } from 'react'
import type { PlacementQuestion } from '@/types'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'

interface PlacementPhaseCardProps {
  question: PlacementQuestion
  teacherVoice: string
  questionNumber: number
  totalQuestions: number
  onAnswer: (transcript: string, score: number) => void
}

export function PlacementPhaseCard({ question, teacherVoice, questionNumber, totalQuestions, onAnswer }: PlacementPhaseCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [ttsLoading, setTtsLoading] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let cancelled = false
    async function playQuestion() {
      setTtsLoading(true)
      try {
        const fd = new FormData()
        fd.append('text', question.prompt_tts)
        fd.append('voice', teacherVoice)
        const res = await fetch('/api/lesson/tts', { method: 'POST', body: fd })
        if (!res.ok || cancelled) return
        const { audio_url } = await res.json()
        if (cancelled) return
        const audio = new Audio(audio_url)
        audioRef.current = audio
        await audio.play()
      } finally {
        if (!cancelled) setTtsLoading(false)
      }
    }
    playQuestion()
    return () => {
      cancelled = true
      audioRef.current?.pause()
    }
  }, [question.id, question.prompt_tts, teacherVoice])

  const handleAudioComplete = async (blob: Blob) => {
    setIsSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('audio', blob, 'recording.webm')
      fd.append('question_id', question.id)
      fd.append('phase', question.phase)
      fd.append('expected_topic', question.expected_topic)
      fd.append('prompt_tts', question.prompt_tts)
      const res = await fetch('/api/placement/assess', { method: 'POST', body: fd })
      if (!res.ok) { onAnswer('', 0); return }
      const data = await res.json()
      setFeedback(data.feedback_pt)
      setTimeout(() => onAnswer(data.transcript ?? '', data.score ?? 0), 1500)
    } catch {
      onAnswer('', 0)
    } finally {
      setIsSubmitting(false)
    }
  }

  const { isRecording, startRecording, stopRecording, error } = useAudioRecorder({ onComplete: handleAudioComplete })

  const handleMic = () => {
    if (isRecording) stopRecording()
    else startRecording()
  }

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="flex items-center justify-between w-full">
        <span className="text-2xl" aria-hidden>{question.phase_emoji}</span>
        <span className="text-xs text-content-light-secondary dark:text-content-dark-secondary font-mono">
          {questionNumber} / {totalQuestions}
        </span>
      </div>

      <div className="text-center">
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary uppercase tracking-wide mb-1">
          {question.phase_label}
        </p>
        <p className="text-base text-content-light dark:text-content-dark">{question.prompt_display}</p>
      </div>

      {ttsLoading && (
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary animate-pulse">
          ♪ Professora falando...
        </p>
      )}

      {feedback && (
        <div className="w-full p-3 rounded-xl bg-surface-light-card dark:bg-surface-dark-card text-center">
          <p className="text-sm text-content-light dark:text-content-dark">{feedback}</p>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-col items-center gap-2">
        {isRecording && (
          <p className="text-sm font-semibold text-red-400 animate-pulse">● Gravando... toque para parar</p>
        )}
        {!isRecording && !isSubmitting && !feedback && (
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">Toque para falar</p>
        )}
        {isSubmitting && (
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">Avaliando...</p>
        )}
        <button
          onClick={handleMic}
          disabled={isSubmitting || ttsLoading || !!feedback}
          aria-label={isRecording ? 'Parar gravação' : 'Gravar resposta'}
          className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all shadow-lg ${
            isRecording
              ? 'bg-red-500 scale-110 animate-pulse'
              : isSubmitting || ttsLoading || feedback
              ? 'bg-surface-light-card dark:bg-surface-dark-card opacity-50 cursor-not-allowed'
              : 'bg-brand-cta hover:scale-105'
          }`}
        >
          {isSubmitting ? '⏳' : isRecording ? '⏹' : '🎤'}
        </button>
      </div>
    </div>
  )
}
