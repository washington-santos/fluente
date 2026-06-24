'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout'
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress'
import { TEACHERS } from '@/config/teachers'
import type { OnboardingLevelResponse } from '@/types'

type RecordState = 'idle' | 'recording' | 'processing'

export default function ConversaPage() {
  const { saveStep, loading } = useOnboardingProgress(5)
  const [state, setState] = useState<RecordState>('idle')
  const [countdown, setCountdown] = useState(45)
  const [error, setError] = useState<string | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        processRecording(recorder.mimeType)
      }
      recorder.start()
      mediaRef.current = recorder
      setState('recording')
      setCountdown(45)
      timerRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) { stopRecording(); return 0 }
          return c - 1
        })
      }, 1000)
    } catch {
      setError('Não foi possível acessar o microfone. Verifique as permissões do navegador.')
    }
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    mediaRef.current?.stop()
    setState('processing')
  }

  async function processRecording(mimeType: string) {
    const blob = new Blob(chunksRef.current, { type: mimeType })
    const form = new FormData()
    form.append('audio', blob, 'recording.webm')

    try {
      const res = await fetch('/api/onboarding/level', { method: 'POST', body: form })
      if (!res.ok) throw new Error('API error')
      const { transcript } = (await res.json()) as OnboardingLevelResponse
      await saveStep(5, { conversation_transcript: transcript })
    } catch {
      setError('Erro ao processar o áudio. Tente novamente.')
      setState('idle')
    }
  }

  if (loading) return null

  const teacher = TEACHERS['mrs-carol']

  return (
    <OnboardingLayout currentStep={5} title="Fale um pouco em inglês" subtitle="Não precisa ser perfeito!">
      <div className="space-y-6">
        <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
          <p className="text-xs font-semibold text-brand-interactive mb-2">Mrs. Carol diz:</p>
          <p className="text-sm text-content-light dark:text-content-dark italic">
            "{teacher.onboarding_prompt}"
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          {state === 'recording' && (
            <p className="text-3xl font-bold text-brand-cta tabular-nums">{countdown}s</p>
          )}

          {state === 'idle' && (
            <button
              onClick={startRecording}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-interactive text-white font-semibold hover:opacity-90 transition-opacity"
              aria-label="Iniciar gravação"
            >
              <Mic size={20} /> Gravar resposta
            </button>
          )}

          {state === 'recording' && (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-500 text-white font-semibold hover:opacity-90 transition-opacity"
              aria-label="Parar gravação"
            >
              <MicOff size={20} /> Parar gravação
            </button>
          )}

          {state === 'processing' && (
            <div className="flex items-center gap-2 text-content-light-secondary dark:text-content-dark-secondary">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Analisando sua fala...</span>
            </div>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-red-500 text-center">{error}</p>}
      </div>
    </OnboardingLayout>
  )
}
