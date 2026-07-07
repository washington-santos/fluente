'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConversationResponse } from '@/types'

interface SessionMessage {
  role: 'user' | 'assistant'
  text: string
  audio_url: string | null
  had_correction: boolean
  pronunciation_hint: string | null  // will be used by Task 4
  suggested_replies: string[] | null
  reply_pt: string | null
}

interface UseSessionReturn {
  sessionId: string | null
  topic: string | null              // ← NEW
  messages: SessionMessage[]
  loading: boolean
  sending: boolean
  initError: string | null
  turnError: string | null
  quotaExceeded: boolean
  quotaInfo: { minutesUsed: number; minutesLimit: number } | null
  lastPromptHint: string | null
  sendTurn: (input: File | string) => Promise<ConversationResponse | null>
  endSession: () => Promise<void>
}

export function useSession(teacherId: string): UseSessionReturn {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [topic, setTopic] = useState<string | null>(null)
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [turnError, setTurnError] = useState<string | null>(null)
  const [quotaExceeded, setQuotaExceeded] = useState(false)
  const [quotaInfo, setQuotaInfo] = useState<{ minutesUsed: number; minutesLimit: number } | null>(null)
  const [lastPromptHint, setLastPromptHint] = useState<string | null>(null)
  const startedAt = useRef(Date.now())

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const getRes = await fetch(`/api/session?teacher_id=${encodeURIComponent(teacherId)}`)

        if (!getRes.ok) {
          if (mounted) setInitError('Não foi possível carregar a sessão. Tente novamente.')
          return
        }

        const data = await getRes.json()
        const session = data.session ?? data

        if (session?.id) {
          if (!mounted) return
          setSessionId(session.id)
          setTopic((session.topic as string | null) ?? null)
          setMessages(
            (session.messages ?? []).map((m: any) => ({
              role: m.role,
              text: m.text,
              audio_url: m.audio_url,
              had_correction: m.had_correction,
              pronunciation_hint: m.pronunciation_hint ?? null,
              suggested_replies: m.suggested_replies ?? null,
              reply_pt: m.reply_pt ?? null,
            }))
          )
          return
        }

        const postRes = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacher_id: teacherId }),
        })
        if (!postRes.ok) {
          if (mounted) setInitError('Não foi possível iniciar a sessão. Tente novamente.')
          return
        }
        const { session_id, topic: newTopic } = await postRes.json()
        if (mounted) {
          setSessionId(session_id)
          setTopic((newTopic as string | null) ?? null)
        }
      } catch (err) {
        console.error('useSession init error:', err)
        if (mounted) setInitError('Erro de conexão. Tente novamente.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [teacherId])

  const sendTurn = useCallback(async (input: File | string): Promise<ConversationResponse | null> => {
    if (!sessionId) return null
    setSending(true)
    setTurnError(null)
    setLastPromptHint(null)

    try {
      const form = new FormData()
      form.append('session_id', sessionId)
      if (typeof input === 'string') {
        form.append('panic_text', input)
      } else {
        form.append('audio', input, 'recording.webm')
      }

      const res = await fetch('/api/conversation', { method: 'POST', body: form })
      if (!res.ok) {
        if (res.status === 429 || res.status === 403) {
          const body = await res.json() as { error: string; minutesUsed?: number; minutesLimit?: number }
          setQuotaExceeded(true)
          setQuotaInfo({ minutesUsed: body.minutesUsed ?? 0, minutesLimit: body.minutesLimit ?? 30 })
        } else {
          setTurnError('Erro ao enviar. Tente novamente.')
        }
        return null
      }
      const data = (await res.json()) as ConversationResponse

      const userText = data.transcript ?? (typeof input === 'string' ? input : '...')

      setMessages((prev) => [
        ...prev,
        { role: 'user', text: userText, audio_url: null, had_correction: false, pronunciation_hint: null, suggested_replies: null, reply_pt: null },
        { role: 'assistant', text: data.text, audio_url: data.audio_url, had_correction: data.had_correction, pronunciation_hint: data.pronunciation_hint ?? null, suggested_replies: data.suggested_replies ?? null, reply_pt: data.reply_pt ?? null },
      ])

      setLastPromptHint(data.prompt_hint ?? null)

      return data
    } catch (err) {
      console.error('sendTurn network error:', err)
      setTurnError('Erro de conexão. Tente novamente.')
      return null
    } finally {
      setSending(false)
    }
  }, [sessionId])

  const endSession = useCallback(async () => {
    if (!sessionId) return
    const elapsed = Date.now() - startedAt.current
    const duration_seconds = Number.isFinite(elapsed) && elapsed > 0
      ? Math.round(elapsed / 1000)
      : 0
    // keepalive: true ensures the request completes even if the page is closing
    const patchRes = await fetch(`/api/session/${sessionId}/end`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_seconds }),
      keepalive: true,
    })
    if (!patchRes.ok) {
      console.error('Failed to end session:', patchRes.status)
      return
    }

    // keepalive: true so the finalize POST survives tab close
    fetch(`/api/session/${sessionId}/finalize`, { method: 'POST', keepalive: true }).catch((err) =>
      console.error('Finalize failed:', err),
    )
  }, [sessionId])

  return { sessionId, topic, messages, loading, sending, initError, turnError, quotaExceeded, quotaInfo, lastPromptHint, sendTurn, endSession }
}
