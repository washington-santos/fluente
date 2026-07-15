'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import type { GuidedConvoStep as StepType } from '@/types/lesson'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'

interface Message {
  role: 'teacher' | 'student'
  text: string
  text_pt?: string
  correct?: boolean
}

interface GuidedConvoStepProps {
  step: StepType
  sessionId: string
  teacherName: string
  teacherImageUrl: string
  ttsVoice: string
  strugglingMode?: boolean
  onComplete: (correctionRate: number) => void
}

export function GuidedConvoStep({ step, sessionId, teacherName, teacherImageUrl, ttsVoice, strugglingMode = false, onComplete }: GuidedConvoStepProps) {
  const [messages, setMessages] = useState<Message[]>([])
  // Start as true so mic stays disabled while initial TTS loads
  const [isSpeaking, setIsSpeaking] = useState(true)
  const [isAssessing, setIsAssessing] = useState(false)
  const [exchangeCount, setExchangeCount] = useState(0)
  const [assessError, setAssessError] = useState<string | null>(null)
  // true = teacher question not yet heard (autoplay blocked or still loading)
  const [awaitingListen, setAwaitingListen] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Pre-fetched audio URL ready to play immediately on user tap (iOS-safe)
  const pendingUrlRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Plays teacher's CURRENT question. Tracks whether autoplay succeeded.
  // If autoplay is blocked (iOS), pendingUrlRef holds the URL for mic-tap triggered play.
  const playCurrentTts = async (text: string) => {
    setIsSpeaking(true)
    setAwaitingListen(true)
    try {
      const fd = new FormData()
      fd.append('text', text)
      fd.append('voice', ttsVoice)
      fd.append('speed', strugglingMode ? '0.85' : '1.0')
      const res = await fetch('/api/lesson/tts', { method: 'POST', body: fd })
      const { audio_url } = await res.json()
      pendingUrlRef.current = audio_url
      return new Promise<void>(resolve => {
        const audio = new Audio(audio_url)
        audioRef.current = audio
        audio.onplaying = () => {
          // Autoplay succeeded — mic will go straight to record after TTS ends
          pendingUrlRef.current = null
          setAwaitingListen(false)
        }
        const done = () => { setIsSpeaking(false); resolve() }
        audio.onended = done
        audio.onerror = () => { setIsSpeaking(false); resolve() }
        audio.play().catch(() => { setIsSpeaking(false); resolve() })
      })
    } catch {
      setIsSpeaking(false)
    }
  }

  // Replays any message on demand (🔊 button). Does not affect awaitingListen state.
  const replayTts = async (text: string) => {
    if (isSpeaking) { audioRef.current?.pause(); setIsSpeaking(false); return }
    setIsSpeaking(true)
    try {
      const fd = new FormData()
      fd.append('text', text)
      fd.append('voice', ttsVoice)
      fd.append('speed', strugglingMode ? '0.85' : '1.0')
      const res = await fetch('/api/lesson/tts', { method: 'POST', body: fd })
      const { audio_url } = await res.json()
      const audio = new Audio(audio_url)
      audioRef.current = audio
      const done = () => setIsSpeaking(false)
      audio.onended = done
      audio.onerror = done
      audio.play().catch(done)
    } catch {
      setIsSpeaking(false)
    }
  }

  useEffect(() => {
    const initial: Message = { role: 'teacher', text: step.teacher_opens_with, text_pt: step.teacher_opens_with_pt }
    setMessages([initial])
    playCurrentTts(step.teacher_opens_with)
    return () => { audioRef.current?.pause() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages])

  const handleAssessment = async (blob: Blob) => {
    setIsAssessing(true)
    setAssessError(null)
    try {
      const fd = new FormData()
      fd.append('session_id', sessionId)
      fd.append('audio', blob, 'recording.webm')
      fd.append('guided_vocab', JSON.stringify(step.allowed_vocabulary))
      if (step.is_challenge) fd.append('is_challenge', 'true')

      const res = await fetch('/api/conversation', { method: 'POST', body: fd })

      if (!res.ok) {
        if (res.status === 429) {
          setAssessError('Você atingiu o limite do seu plano. Veja seus planos para continuar.')
        } else {
          setAssessError('Não entendi. Fale mais devagar e tente novamente. 🎙️')
        }
        return
      }

      const data = await res.json()

      if (!data.transcript?.trim()) {
        setAssessError('Não detectei sua voz. Fale mais alto e tente novamente. 🎙️')
        return
      }

      const studentMsg: Message = { role: 'student', text: data.transcript, correct: !data.had_correction }
      const teacherMsg: Message = { role: 'teacher', text: data.text ?? '', text_pt: data.reply_pt }

      setMessages(prev => [...prev, studentMsg, teacherMsg])
      if (!data.had_correction) setExchangeCount(c => c + 1)
      setIsAssessing(false)
      if (data.text) await playCurrentTts(data.text)
    } catch {
      setAssessError('Erro ao processar. Tente novamente.')
    } finally {
      setIsAssessing(false)
    }
  }

  const { isRecording, startRecording, stopRecording, error: recorderError } = useAudioRecorder({ onComplete: handleAssessment })

  const handleMic = () => {
    if (isRecording) { stopRecording(); return }
    if (isSpeaking || isAssessing) return
    setAssessError(null)

    const url = pendingUrlRef.current
    if (url) {
      // Autoplay was blocked — play TTS now directly from user gesture (no await → iOS-safe)
      pendingUrlRef.current = null
      setAwaitingListen(false)
      setIsSpeaking(true)
      const audio = new Audio(url)
      audioRef.current = audio
      // After teacher speaks, start recording automatically
      audio.onended = () => { setIsSpeaking(false); startRecording() }
      audio.onerror = () => { setIsSpeaking(false); startRecording() }
      audio.play().catch(() => { setIsSpeaking(false); startRecording() })
    } else {
      startRecording()
    }
  }

  const canComplete = exchangeCount >= step.min_exchanges
  const studentMessages = messages.filter(m => m.role === 'student')
  const correctionRate = studentMessages.length > 0
    ? studentMessages.filter(m => m.correct === false).length / studentMessages.length
    : 0
  const displayError = assessError ?? recorderError

  const micIcon = isAssessing ? '⏳' : isSpeaking ? '🔊' : isRecording ? '⏹' : awaitingListen ? '🔊' : '🎤'
  const micHint = isRecording
    ? 'Gravando... toque para parar'
    : isSpeaking
    ? 'Professora falando...'
    : isAssessing
    ? 'Avaliando...'
    : awaitingListen
    ? 'Toque para ouvir a pergunta e depois falar'
    : canComplete
    ? 'Pronto para continuar!'
    : `${exchangeCount} / ${step.min_exchanges} trocas`

  return (
    <div className="flex flex-col h-full">
      {step.is_challenge && (
        <p className="text-center text-sm font-bold text-brand-cta pt-3">🏆 Desafio final</p>
      )}
      <p className="text-sm text-content-light-secondary dark:text-content-dark-secondary text-center px-4 pt-4 pb-2">
        {step.instruction_pt}
      </p>

      <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'student' ? 'justify-end' : 'justify-start gap-2 items-end'}`}>
            {msg.role === 'teacher' && (
              <Image src={teacherImageUrl} alt={teacherName} width={32} height={32} className="rounded-full flex-shrink-0" />
            )}
            <div className={`max-w-[75%] p-3 rounded-2xl text-sm ${
              msg.role === 'student'
                ? msg.correct === false
                  ? 'bg-red-500/80 text-white rounded-br-sm'
                  : 'bg-brand-interactive text-content-dark rounded-br-sm'
                : 'bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark rounded-bl-sm'
            }`}>
              <p>{msg.text}</p>
              {msg.text_pt && (
                <p className="text-xs opacity-60 mt-1 italic">{msg.text_pt}</p>
              )}
              {msg.role === 'teacher' && msg.text && (
                <button
                  onClick={() => replayTts(msg.text)}
                  disabled={isAssessing || isRecording}
                  className="mt-2 text-xs opacity-50 hover:opacity-100 transition-opacity disabled:opacity-20"
                  aria-label="Ouvir novamente"
                >
                  🔊 ouvir
                </button>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex flex-col items-center gap-3 px-4 py-4 border-t border-surface-light-card dark:border-surface-dark-card">
        {displayError && (
          <p className="text-xs text-red-400 text-center">{displayError}</p>
        )}
        <button
          onClick={handleMic}
          disabled={isAssessing || isSpeaking}
          aria-label={isRecording ? 'Parar' : awaitingListen ? 'Ouvir pergunta' : 'Falar'}
          className={`w-16 h-16 rounded-full text-2xl transition-all shadow-lg ${
            isRecording
              ? 'bg-red-500 scale-110'
              : (isAssessing || isSpeaking)
              ? 'bg-surface-light-card dark:bg-surface-dark-card opacity-50 cursor-not-allowed'
              : 'bg-brand-cta hover:scale-105'
          }`}
        >
          {micIcon}
        </button>
        <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary text-center">
          {micHint}
        </p>
        {canComplete && (
          <button
            onClick={() => onComplete(correctionRate)}
            className="w-full py-3 rounded-xl bg-brand-interactive text-content-dark font-bold hover:opacity-90 transition-opacity"
          >
            Finalizar conversa →
          </button>
        )}
      </div>
    </div>
  )
}
