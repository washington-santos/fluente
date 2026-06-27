'use client'

import { useEffect, useRef, useState } from 'react'
import type { ConversationResponse } from '@/types'

interface SessionMessage {
  role: 'user' | 'assistant'
  text: string
  audio_url: string | null
  had_correction: boolean
}

interface UseSessionReturn {
  sessionId: string | null
  messages: SessionMessage[]
  loading: boolean
  sending: boolean
  initError: string | null
  turnError: string | null
  sendTurn: (input: File | string) => Promise<ConversationResponse | null>
  endSession: () => Promise<void>
}

export function useSession(teacherId: string): UseSessionReturn {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [turnError, setTurnError] = useState<string | null>(null)
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
          setMessages(
            (session.messages ?? []).map((m: any) => ({
              role: m.role,
              text: m.text,
              audio_url: m.audio_url,
              had_correction: m.had_correction,
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
        const { session_id } = await postRes.json()
        if (mounted) setSessionId(session_id)
      } catch (err) {
        console.error('useSession init error:', err)
        if (mounted) setInitError('Erro de conexão. Tente novamente.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [teacherId])

  async function sendTurn(input: File | string): Promise<ConversationResponse | null> {
    if (!sessionId) return null
    setSending(true)
    setTurnError(null)

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
        setTurnError('Erro ao enviar. Tente novamente.')
        return null
      }
      const data = (await res.json()) as ConversationResponse

      const userText = data.transcript ?? (typeof input === 'string' ? input : '...')

      setMessages((prev) => [
        ...prev,
        { role: 'user', text: userText, audio_url: null, had_correction: false },
        { role: 'assistant', text: data.text, audio_url: data.audio_url, had_correction: data.had_correction },
      ])

      return data
    } finally {
      setSending(false)
    }
  }

  async function endSession() {
    if (!sessionId) return
    // Fix 7: Guard against NaN/negative duration values
    const elapsed = Date.now() - startedAt.current
    const duration_seconds = Number.isFinite(elapsed) && elapsed > 0
      ? Math.round(elapsed / 1000)
      : 0
    // Fix 8: Check PATCH response instead of silently swallowing errors
    const patchRes = await fetch(`/api/session/${sessionId}/end`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_seconds }),
    })
    if (!patchRes.ok) {
      console.error('Failed to end session:', patchRes.status)
      return
    }

    // Fire-and-forget: generate memory, update streak, upsert errors
    // Do not await — navigation should not be blocked by this
    fetch(`/api/session/${sessionId}/finalize`, { method: 'POST' }).catch((err) =>
      console.error('Finalize failed:', err),
    )
  }

  return { sessionId, messages, loading, sending, initError, turnError, sendTurn, endSession }
}
