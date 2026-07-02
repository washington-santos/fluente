'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { RecordButton } from '@/components/aula/RecordButton'
import { MessageBubble } from '@/components/aula/MessageBubble'
import { TeacherAvatar } from '@/components/aula/TeacherAvatar'
import { PanicButton } from '@/components/aula/PanicButton'
import { TopicBadge } from '@/components/aula/TopicBadge'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useSession } from '@/hooks/useSession'
import { getTopicByKey } from '@/lib/topics'
import type { Teacher, ConversationResponse } from '@/types'

interface AulaClientProps {
  teacher: Teacher
}

export function AulaClient({ teacher }: AulaClientProps) {
  const router = useRouter()
  const { sessionId, topic, messages, loading, sending, turnError, initError, quotaExceeded, quotaInfo, sendTurn, endSession } = useSession(teacher.id)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const handleTurn = useCallback(async (input: File | string) => {
    const response = await sendTurn(input)
    if (!response) return
    playAudio(response)
  }, [sendTurn])

  function playAudio(response: ConversationResponse) {
    // Stop any currently playing audio before starting new playback
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.onended = null
      audioRef.current = null
    }

    setVideoUrl(response.video_url)
    // audio_url may be null if TTS failed — skip playback gracefully
    if (!response.audio_url) return
    const audio = new Audio(response.audio_url)
    audioRef.current = audio
    setIsSpeaking(true)
    audio.play().catch(() => setIsSpeaking(false))
    audio.onended = () => {
      setIsSpeaking(false)
      audioRef.current = null
    }
  }

  const { isRecording, startRecording, stopRecording, cancelRecording, error: micError } = useAudioRecorder({
    onComplete: (blob) => {
      const base = blob.type.split(';')[0]
      const ext = base.split('/')[1] || 'webm'
      handleTurn(new File([blob], `recording.${ext}`, { type: base }))
    },
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages])

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.onended = null
        audioRef.current = null
      }
    }
  }, [])

  // Call endSession when user closes tab or navigates away without clicking the button
  useEffect(() => {
    const handleUnload = () => { endSession() }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [endSession])

  async function handleEnd() {
    await endSession()
    router.push('/dashboard')
  }

  // Fix 5: Surface session init errors so the UI is not silently non-functional
  if (initError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-red-500">{initError}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg bg-brand-cta text-white hover:opacity-90 transition-opacity"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col max-h-screen overflow-hidden">
      <header className="flex items-center justify-between p-4 shrink-0">
        <button
          onClick={handleEnd}
          disabled={sending || loading}
          className="flex items-center gap-1 text-sm text-content-light-secondary dark:text-content-dark-secondary hover:text-red-500 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          <X size={16} /> Encerrar aula
        </button>
        <ThemeToggle />
      </header>

      <div className="flex flex-col items-center py-4 shrink-0">
        <TeacherAvatar
          name={teacher.name}
          imageUrl={teacher.avatar_image_url}
          videoUrl={videoUrl}
          isSpeaking={isSpeaking}
        />
      </div>

      {topic && getTopicByKey(topic) && (
        <div className="flex justify-center pb-2 shrink-0">
          <TopicBadge topic={getTopicByKey(topic)!.labelPt} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
        {loading && (
          <p className="text-center text-sm text-content-light-secondary dark:text-content-dark-secondary">
            Conectando...
          </p>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} text={m.text} hadCorrection={m.had_correction} pronunciationHint={m.pronunciation_hint} />
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="px-4 py-3 rounded-2xl bg-surface-light-card dark:bg-surface-dark-card text-content-light-secondary dark:text-content-dark-secondary text-sm animate-pulse">
              {teacher.name} está respondendo...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 px-4 py-6 flex flex-col items-center gap-4">
        {quotaExceeded ? (
          <div className="w-full rounded-2xl bg-surface-light-card dark:bg-surface-dark-card p-5 flex flex-col items-center gap-2 text-center">
            <p className="text-sm font-semibold text-content-light dark:text-content-dark">
              Limite do plano atingido
            </p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
              Você usou {(quotaInfo?.minutesUsed ?? 0).toFixed(1)} de {quotaInfo?.minutesLimit} minutos este mês.
            </p>
            <a
              href="/planos"
              className="mt-1 px-4 py-2 rounded-lg bg-brand-cta text-white text-sm hover:opacity-90 transition-opacity"
            >
              Ver planos
            </a>
          </div>
        ) : (
          <>
            {(micError || turnError) && (
              <p role="alert" className="text-xs text-red-500 text-center">{micError || turnError}</p>
            )}
            <RecordButton
              isRecording={isRecording}
              onStartRecording={startRecording}
              onSendRecording={stopRecording}
              onCancelRecording={cancelRecording}
              disabled={sending || loading}
            />
            {!isRecording && (
              <PanicButton onSubmit={(text) => handleTurn(text)} disabled={sending || loading} />
            )}
          </>
        )}
      </div>
    </main>
  )
}
