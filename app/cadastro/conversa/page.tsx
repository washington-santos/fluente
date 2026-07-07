'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout'
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress'
import { TEACHERS, getTeacherForLevel } from '@/config/teachers'
import type { CefrLevel, OnboardingLevelResponse } from '@/types'

type RecordState = 'idle' | 'recording' | 'processing'

export default function ConversaPage() {
  const { progress, saveStep, loading } = useOnboardingProgress(5)
  const [state, setState] = useState<RecordState>('idle')
  const [countdown, setCountdown] = useState(45)
  const [error, setError] = useState<string | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef(45)
  const mountedRef = useRef(true)

  useEffect(() => () => {
    mountedRef.current = false
    if (timerRef.current) clearInterval(timerRef.current)
    if (mediaRef.current) {
      mediaRef.current.stop()
      mediaRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        processRecording(recorder.mimeType)
      }
      recorder.start()
      mediaRef.current = recorder
      setState('recording')
      countdownRef.current = 45
      setCountdown(45)
      timerRef.current = setInterval(() => {
        countdownRef.current -= 1
        setCountdown(countdownRef.current)
        if (countdownRef.current <= 0) {
          stopRecording()
        }
      }, 1000)
    } catch {
      setError('Não foi possível acessar o microfone. Verifique as permissões do navegador.')
    }
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (mediaRef.current) {
      mediaRef.current.stop()
      mediaRef.current = null  // prevent cleanup from calling stop() on inactive recorder (throws DOMException)
    }
    setState('processing')
  }

  async function processRecording(mimeType: string) {
    if (!mountedRef.current) return  // component unmounted mid-recording — abort silently
    const blob = new Blob(chunksRef.current, { type: mimeType })
    const form = new FormData()
    form.append('audio', blob, 'recording.webm')

    try {
      const res = await fetch('/api/onboarding/level', { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const detail = (body as { error?: string }).error ?? `HTTP ${res.status}`
        console.error('[conversa] API error:', detail)
        setError(`Erro ao processar o áudio (${detail}). Tente novamente.`)
        setState('idle')
        return
      }
      const { transcript, level } = (await res.json()) as OnboardingLevelResponse
      if (!mountedRef.current) return
      const prevAnswers = progress?.written_answers ?? []
      await saveStep(5, {
        conversation_transcript: transcript,
        written_answers: [...prevAnswers, level],
      })
    } catch (e) {
      if (!mountedRef.current) return
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[conversa] fetch error:', msg)
      setError(`Erro ao processar o áudio (${msg}). Tente novamente.`)
      setState('idle')
    }
  }

  if (loading) return null

  const mcqLevel = (progress?.written_answers?.[3] as CefrLevel | undefined) ?? 'A1'
  const teacher = TEACHERS[getTeacherForLevel(mcqLevel)]

  return (
    <OnboardingLayout currentStep={5} title="Fale um pouco em inglês" subtitle="Não precisa ser perfeito!">
      <div className="space-y-6">
        <div className="p-4 rounded-xl bg-surface-light-card dark:bg-surface-dark-card">
          <p className="text-xs font-semibold text-brand-interactive mb-2">{teacher.name} diz:</p>
          <p className="text-sm text-content-light dark:text-content-dark italic">
            &ldquo;{teacher.onboarding_prompt}&rdquo;
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
