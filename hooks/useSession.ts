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
  sendTurn: (input: File | string) => Promise<ConversationResponse | null>
  endSession: () => Promise<void>
}

export function useSession(teacherId: string): UseSessionReturn {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const startedAt = useRef(Date.now())

  useEffect(() => {
    ;(async () => {
      const getRes = await fetch('/api/session')
      const { session } = await getRes.json()

      if (session) {
        setSessionId(session.id)
        setMessages(
          (session.messages ?? []).map((m: any) => ({
            role: m.role,
            text: m.text,
            audio_url: m.audio_url,
            had_correction: m.had_correction,
          }))
        )
      } else {
        const postRes = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacher_id: teacherId }),
        })
        const { session_id } = await postRes.json()
        setSessionId(session_id)
      }

      setLoading(false)
    })()
  }, [teacherId])

  async function sendTurn(input: File | string): Promise<ConversationResponse | null> {
    if (!sessionId) return null
    setSending(true)

    try {
      const form = new FormData()
      form.append('session_id', sessionId)
      if (typeof input === 'string') {
        form.append('panic_text', input)
      } else {
        form.append('audio', input, 'recording.webm')
      }

      const res = await fetch('/api/conversation', { method: 'POST', body: form })
      if (!res.ok) return null
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
    const duration = Math.round((Date.now() - startedAt.current) / 1000)
    await fetch(`/api/session/${sessionId}/end`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_seconds: duration }),
    })
  }

  return { sessionId, messages, loading, sending, sendTurn, endSession }
}
