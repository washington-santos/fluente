'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { VocabRepeatStep as StepType, VocabItem } from '@/types/lesson'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'

interface VocabRepeatStepProps {
  step: StepType
  vocab: VocabItem
  onSuccess: (score: number) => void
}

type AssessResult = { assessment: 'correct' | 'close' | 'incorrect'; score: number; feedback_pt: string; phoneme_note_pt: string | null }

export function VocabRepeatStep({ step, vocab, onSuccess }: VocabRepeatStepProps) {
  const [result, setResult] = useState<AssessResult | null>(null)
  const [isAssessing, setIsAssessing] = useState(false)
  const [attempts, setAttempts] = useState(0)

  const assess = async (blob: Blob) => {
    setIsAssessing(true)
    try {
      const fd = new FormData()
      fd.append('type', 'pronunciation')
      fd.append('target', vocab.word)
      fd.append('audio', blob, 'recording.webm')
      const res = await fetch('/api/lesson/assess', { method: 'POST', body: fd })
      const data: AssessResult = await res.json()
      setResult(data)
      setAttempts(a => a + 1)
    } catch {
      setResult({ assessment: 'incorrect', score: 0, feedback_pt: 'Erro ao avaliar. Tente novamente.', phoneme_note_pt: null })
      setAttempts(a => a + 1)
    } finally {
      setIsAssessing(false)
    }
  }

  const { isRecording, startRecording, stopRecording, error } = useAudioRecorder({ onComplete: assess })

  const handleMic = () => {
    if (isRecording) {
      stopRecording()
    } else {
      setResult(null)
      startRecording()
    }
  }

  const canAdvance = result !== null && (result.assessment === 'correct' || result.assessment === 'close' || attempts >= 3)

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <span className="text-6xl" aria-hidden>{vocab.emoji}</span>
      <div className="text-center">
        <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">
          {step.instruction_pt}
        </p>
        <p className="text-4xl font-bold text-content-light dark:text-content-dark mt-2">{vocab.word}</p>
        <p className="text-sm text-brand-interactive font-mono mt-1">/{vocab.pronunciation_hint}/</p>
      </div>

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`w-full p-4 rounded-xl text-center ${
            result.assessment === 'correct' ? 'bg-green-500/15' :
            result.assessment === 'close' ? 'bg-yellow-500/15' :
            'bg-red-500/15'
          }`}
        >
          <p className="font-bold text-content-light dark:text-content-dark text-lg">
            {result.assessment === 'correct' ? '✅ Perfeito!' :
             result.assessment === 'close' ? '🟡 Quase lá!' :
             '❌ Tente novamente'}
          </p>
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary mt-1">
            {result.feedback_pt}
          </p>
          {result.phoneme_note_pt && (
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-2 italic">
              {result.phoneme_note_pt}
            </p>
          )}
        </motion.div>
      )}

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <div className="flex flex-col items-center gap-2">
        {isRecording && (
          <p className="text-sm font-semibold text-red-400 animate-pulse">● Gravando... toque para parar</p>
        )}
        {!isRecording && !isAssessing && !result && (
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">Toque para falar</p>
        )}
        {isAssessing && (
          <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary">Avaliando...</p>
        )}
        <button
          onClick={handleMic}
          disabled={isAssessing}
          aria-label={isRecording ? 'Parar gravação' : 'Gravar pronúncia'}
          className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all shadow-lg ${
            isRecording
              ? 'bg-red-500 scale-110 shadow-red-500/30 animate-pulse'
              : isAssessing
              ? 'bg-surface-light-card dark:bg-surface-dark-card opacity-50 cursor-not-allowed'
              : 'bg-brand-cta hover:scale-105'
          }`}
        >
          {isAssessing ? '⏳' : isRecording ? '⏹' : '🎤'}
        </button>
      </div>

      {attempts > 0 && !isRecording && !isAssessing && (
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
          Tentativa {attempts} de 3
        </p>
      )}

      {canAdvance && (
        <button
          onClick={() => onSuccess(result?.score ?? 0.5)}
          className="w-full py-4 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
        >
          Continuar →
        </button>
      )}
    </div>
  )
}
