'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { RecordButton } from '@/components/aula/RecordButton'
import { MessageBubble } from '@/components/aula/MessageBubble'
import { TeacherAvatar } from '@/components/aula/TeacherAvatar'
import { PanicButton } from '@/components/aula/PanicButton'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useSession } from '@/hooks/useSession'
import type { Teacher, User, ConversationResponse } from '@/types'

interface AulaClientProps {
  teacher: Teacher
  user: User
}

export function AulaClient({ teacher, user }: AulaClientProps) {
  const router = useRouter()
  const { sessionId, messages, loading, sending, sendTurn, endSession } = useSession(teacher.id)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  async function handleTurn(input: File | string) {
    const response = await sendTurn(input)
    if (!response) return
    playAudio(response)
  }

  function playAudio(response: ConversationResponse) {
    // Stop any currently playing audio before starting new playback
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.onended = null
      audioRef.current = null
    }

    setVideoUrl(response.video_url)
    const audio = new Audio(response.audio_url)
    audioRef.current = audio
    setIsSpeaking(true)
    audio.play().catch(() => setIsSpeaking(false))
    audio.onended = () => {
      setIsSpeaking(false)
      audioRef.current = null
    }
  }

  const { isRecording, startRecording, stopRecording, error: micError } = useAudioRecorder({
    onComplete: (blob) => handleTurn(new File([blob], 'recording.webm', { type: blob.type })),
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages])

  async function handleEnd() {
    await endSession()
    router.push('/dashboard')
  }

  return (
    <main className="min-h-screen bg-surface-light dark:bg-surface-dark flex flex-col max-h-screen overflow-hidden">
      <header className="flex items-center justify-between p-4 shrink-0">
        <button
          onClick={handleEnd}
          className="flex items-center gap-1 text-sm text-content-light-secondary dark:text-content-dark-secondary hover:text-red-500 transition-colors"
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

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
        {loading && (
          <p className="text-center text-sm text-content-light-secondary dark:text-content-dark-secondary">
            Conectando...
          </p>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} text={m.text} hadCorrection={m.had_correction} />
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
        {micError && (
          <p role="alert" className="text-xs text-red-500 text-center">{micError}</p>
        )}
        <RecordButton
          isRecording={isRecording}
          onPressStart={startRecording}
          onPressEnd={stopRecording}
          disabled={sending || loading}
        />
        <PanicButton onSubmit={(text) => handleTurn(text)} disabled={sending || loading || isRecording} />
      </div>
    </main>
  )
}
