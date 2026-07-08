'use client'

import { useEffect, useRef, useState } from 'react'
import type { GuidedConvoStep as StepType } from '@/types/lesson'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'

interface Message {
  role: 'teacher' | 'student'
  text: string
  text_pt?: string
}

interface GuidedConvoStepProps {
  step: StepType
  teacherName: string
  teacherImageUrl: string
  ttsVoice: string
  onComplete: () => void
}

export function GuidedConvoStep({ step, teacherName, teacherImageUrl, ttsVoice, onComplete }: GuidedConvoStepProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isAssessing, setIsAssessing] = useState(false)
  const [exchangeCount, setExchangeCount] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const playTts = async (text: string) => {
    setIsSpeaking(true)
    try {
      const fd = new FormData()
      fd.append('text', text)
      fd.append('voice', ttsVoice)
      const res = await fetch('/api/lesson/tts', { method: 'POST', body: fd })
      const { audio_url } = await res.json()
      return new Promise<void>(resolve => {
        const audio = new Audio(audio_url)
        audioRef.current = audio
        const done = () => { setIsSpeaking(false); resolve() }
        audio.onended = done
        audio.onerror = done
        audio.play().catch(done)
      })
    } catch {
      setIsSpeaking(false)
    }
  }

  useEffect(() => {
    const initial: Message = { role: 'teacher', text: step.teacher_opens_with, text_pt: step.teacher_opens_with_pt }
    setMessages([initial])
    playTts(step.teacher_opens_with)
    return () => { audioRef.current?.pause() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleAssessment = async (blob: Blob) => {
    setIsAssessing(true)
    try {
      const history = messages.map(m => ({
        role: m.role === 'teacher' ? 'assistant' : 'user',
        content: m.text,
      }))
      const fd = new FormData()
      fd.append('type', 'conversation')
      fd.append('target', step.teacher_opens_with)
      fd.append('audio', blob, 'recording.webm')
      fd.append('allowed_vocab', JSON.stringify(step.allowed_vocabulary))
      fd.append('history', JSON.stringify(history))
      const res = await fetch('/api/lesson/assess', { method: 'POST', body: fd })
      const data = await res.json()

      const studentMsg: Message = { role: 'student', text: data.transcript ?? '...' }
      const teacherMsg: Message = { role: 'teacher', text: data.reply ?? '', text_pt: data.reply_pt }

      setMessages(prev => [...prev, studentMsg, teacherMsg])
      setExchangeCount(c => c + 1)
      setIsAssessing(false)
      if (data.reply) await playTts(data.reply)
    } catch {
      // assessment failure is non-blocking
    } finally {
      setIsAssessing(false)
    }
  }

  const { isRecording, startRecording, stopRecording, error } = useAudioRecorder({ onComplete: handleAssessment })

  const handleMic = () => {
    if (isRecording) stopRecording()
    else startRecording()
  }

  const canComplete = exchangeCount >= step.min_exchanges

  return (
    <div className="flex flex-col h-full">
      <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary text-center px-4 pt-4 pb-2">
        {step.instruction_pt}
      </p>

      <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'student' ? 'justify-end' : 'justify-start gap-2 items-end'}`}>
            {msg.role === 'teacher' && (
              <img src={teacherImageUrl} alt={teacherName} className="w-8 h-8 rounded-full flex-shrink-0" />
            )}
            <div className={`max-w-[75%] p-3 rounded-2xl text-sm ${
              msg.role === 'student'
                ? 'bg-brand-interactive text-content-dark rounded-br-sm'
                : 'bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark rounded-bl-sm'
            }`}>
              <p>{msg.text}</p>
              {msg.text_pt && (
                <p className="text-xs opacity-60 mt-1 italic">{msg.text_pt}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex flex-col items-center gap-3 px-4 py-4 border-t border-surface-light-card dark:border-surface-dark-card">
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          onClick={handleMic}
          disabled={isAssessing || isSpeaking}
          aria-label={isRecording ? 'Parar' : 'Falar'}
          className={`w-16 h-16 rounded-full text-2xl transition-all shadow-lg ${
            isRecording
              ? 'bg-red-500 scale-110'
              : (isAssessing || isSpeaking)
              ? 'bg-surface-light-card dark:bg-surface-dark-card opacity-50 cursor-not-allowed'
              : 'bg-brand-cta hover:scale-105'
          }`}
        >
          {isAssessing ? '⏳' : isSpeaking ? '🔊' : isRecording ? '⏹' : '🎤'}
        </button>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
          {canComplete ? 'Pronto para continuar!' : `${exchangeCount} / ${step.min_exchanges} trocas`}
        </p>
        {canComplete && (
          <button
            onClick={onComplete}
            className="w-full py-3 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
          >
            Finalizar conversa →
          </button>
        )}
      </div>
    </div>
  )
}
