// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockUserData = { id: 'user-1', name: 'Ana', cefr_level: 'B1', teacher_id: 'teacher-1', demo_status: 'active', demo_started_at: '2026-07-01T00:00:00Z', demo_expires_at: '2099-12-31T00:00:00Z' }
const mockSession = { id: 'session-1', user_id: 'user-1', teacher_id: 'teacher-1', teacher: { id: 'teacher-1', slug: 'mr-jake', name: 'Mr. Jake', system_prompt: 'You are Mr. Jake.', tts_voice: 'echo', avatar_image_url: '/avatars/mr-jake.png' } }

const { mockChatCreate, mockMessagesInsert, mockInsertSingle } = vi.hoisted(() => ({
  mockChatCreate: vi.fn().mockResolvedValue({
    choices: [{ message: { content: '{"reply":"Hi Ana!","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null},"pronunciation_hint":"Try to buzz the \'th\' sound, like in \'the\'.","new_words":[{"word":"negotiate","definition":"to discuss terms to reach agreement"}],"suggested_replies":["I\'m doing well, thanks!","I\'m fine."],"reply_pt":"Olá Ana!","prompt_hint":"Tente dizer: I\'m doing well."}' } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  }),
  mockInsertSingle: vi.fn().mockResolvedValue({ data: { id: 'assistant-msg-1' }, error: null }),
  mockMessagesInsert: vi.fn(),
}))

mockMessagesInsert.mockImplementation(() => ({
  select: vi.fn(() => ({ single: mockInsertSingle })),
}))

vi.mock('@/lib/vip', () => ({ isUserVip: vi.fn().mockResolvedValue(null) }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    rpc: vi.fn().mockResolvedValue({ error: null }),
    from: vi.fn((table: string) => {
      if (table === 'sessions') return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockSession, error: null }),
            })),
          })),
        })),
      }
      if (table === 'users') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: mockUserData, error: null }) })) })),
      }
      if (table === 'subscriptions') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })),
      }
      if (table === 'usage_log') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ gte: vi.fn().mockResolvedValue({ data: [], error: null }) })) })),
      }
      if (table === 'session_memory') return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
          })),
        })),
      }
      if (table === 'errors_log') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { error_text: 'I goed to school', correct_form: 'I went to school', error_type: 'verb_tense' },
            error: null,
          }),
        }
      }
      if (table === 'messages') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })) })) })),
        insert: mockMessagesInsert,
      }
      if (table === 'vocab_log') {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return {}
    }),
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    audio = {
      transcriptions: { create: vi.fn().mockResolvedValue({ text: 'Hello teacher.' }) },
    }
    chat = { completions: { create: mockChatCreate } }
  },
}))

function makeFormRequest(fields: Record<string, string | Blob>) {
  const form = new FormData()
  Object.entries(fields).forEach(([k, v]) => form.append(k, v))
  return new Request('http://localhost/api/conversation', { method: 'POST', body: form })
}

import { POST } from '@/app/api/conversation/route'

describe('POST /api/conversation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns text immediately with audio/video pending — no audio_url yet', async () => {
    const audio = new Blob(['fake-audio'], { type: 'audio/webm' })
    const res = await POST(makeFormRequest({ session_id: 'session-1', audio }))
    const body = await res.json()
    expect(body.text).toBe('Hi Ana!')
    expect(body.message_id).toBe('assistant-msg-1')
    expect(body.audio_url).toBeNull()
    expect(body.audio_status).toBe('pending')
    expect(body.video_url).toBeNull()
    expect(['pending', 'skipped']).toContain(body.video_status)
    expect(body.had_correction).toBe(false)
    expect(body).toHaveProperty('new_words')
    expect(body.suggested_replies).toEqual(["I'm doing well, thanks!", "I'm fine."])
    expect(body.reply_pt).toBe('Olá Ana!')
  })

  it('persists reply_pt and suggested_replies on the assistant message row', async () => {
    const audio = new Blob(['fake-audio'], { type: 'audio/webm' })
    await POST(makeFormRequest({ session_id: 'session-1', audio }))

    const assistantCall = mockMessagesInsert.mock.calls.find((call: any[]) => call[0]?.[0]?.role === 'assistant')
    expect(assistantCall).toBeDefined()
    expect(assistantCall![0][0].reply_pt).toBe('Olá Ana!')
    expect(assistantCall![0][0].suggested_replies).toEqual(["I'm doing well, thanks!", "I'm fine."])
    expect(assistantCall![0][0].audio_status).toBe('pending')
  })

  it('requests JSON mode from the chat completion', async () => {
    const audio = new Blob(['fake-audio'], { type: 'audio/webm' })
    await POST(makeFormRequest({ session_id: 'session-1', audio }))
    expect(mockChatCreate).toHaveBeenCalledWith(
      expect.objectContaining({ response_format: { type: 'json_object' } }),
    )
  })

  it('handles panic_text instead of audio', async () => {
    const res = await POST(makeFormRequest({ session_id: 'session-1', panic_text: 'I go to school yesterday.' }))
    const body = await res.json()
    expect(body.text).toBe('Hi Ana!')
  })

  it('includes pronunciation_hint in response when GPT provides one', async () => {
    const form = new FormData()
    form.append('session_id', 'session-1')
    form.append('panic_text', 'I tink dis is good')
    const res = await POST(new Request('http://localhost/api/conversation', { method: 'POST', body: form }))
    const body = await res.json()
    expect(typeof body.pronunciation_hint === 'string' || body.pronunciation_hint === null).toBe(true)
  })

  it('returns 400 when both audio and panic_text are missing', async () => {
    const res = await POST(makeFormRequest({ session_id: 'session-1' }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const res = await POST(makeFormRequest({ session_id: 'session-1', panic_text: 'hi' }))
    expect(res.status).toBe(401)
  })

  it('injects session memory into system prompt when memory exists', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
      rpc: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn((table: string) => {
        if (table === 'sessions') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mockSession, error: null }) })) })) })),
        }
        if (table === 'users') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: mockUserData, error: null }) })) })),
        }
        if (table === 'subscriptions') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })),
        }
        if (table === 'usage_log') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ gte: vi.fn().mockResolvedValue({ data: [], error: null }) })) })),
        }
        if (table === 'session_memory') return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { summary: 'Student likes coding.', key_topics: ['present perfect'], personal_details: ['software engineer'] },
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        }
        if (table === 'errors_log') {
          return {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'messages') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })) })) })),
          insert: mockMessagesInsert,
        }
        if (table === 'vocab_log') return { upsert: vi.fn().mockResolvedValue({ error: null }) }
        return {}
      }),
    } as any)

    await POST(makeFormRequest({ session_id: 'session-1', panic_text: 'Hello.' }))

    const callArgs = mockChatCreate.mock.calls[0][0]
    const systemMsg = callArgs.messages.find((m: { role: string }) => m.role === 'system')
    expect(systemMsg?.content).toContain('Student likes coding.')
  })

  describe('quota enforcement', () => {
    it('returns 429 when demo user has exhausted 30 demo minutes', async () => {
      const { createServerClient } = await import('@supabase/ssr')
      vi.mocked(createServerClient).mockReturnValueOnce({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
        from: vi.fn((table: string) => {
          if (table === 'subscriptions') {
            return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })) }
          }
          if (table === 'users') {
            return {
              select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { demo_status: 'active', demo_started_at: '2026-07-01T00:00:00Z', demo_expires_at: '2099-12-31T00:00:00Z' }, error: null }) })) })),
              update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
            }
          }
          if (table === 'usage_log') {
            return { select: vi.fn(() => ({ eq: vi.fn(() => ({ gte: vi.fn().mockResolvedValue({ data: [{ whisper_minutes: 30.5 }], error: null }) })) })) }
          }
          return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) })) })) })) }
        }),
      } as any)

      const res = await POST(makeFormRequest({ session_id: 'sess-1', panic_text: 'test' }))
      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body.error).toBe('demo_exhausted')
      expect(body.minutesUsed).toBeCloseTo(30.5)
      expect(body.minutesLimit).toBe(30)
    })

    it('proceeds normally when user is within quota', async () => {
      const { createServerClient } = await import('@supabase/ssr')
      vi.mocked(createServerClient).mockReturnValueOnce({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-3' } } }) },
        from: vi.fn((table: string) => {
          if (table === 'subscriptions') {
            return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { plan_id: 'pro', plans: { minutes_per_month: 300 } }, error: null }) })) })) })) }
          }
          if (table === 'users') {
            return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: mockUserData, error: null }) })) })) }
          }
          if (table === 'usage_log') {
            return { select: vi.fn(() => ({ eq: vi.fn(() => ({ gte: vi.fn().mockResolvedValue({ data: [{ whisper_minutes: 5 }], error: null }) })) })) }
          }
          if (table === 'messages') return {
            select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })) })) })),
            insert: mockMessagesInsert,
          }
          if (table === 'session_memory') return {
            select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })) })),
          }
          if (table === 'errors_log') return {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
          if (table === 'vocab_log') return { upsert: vi.fn().mockResolvedValue({ error: null }) }
          if (table === 'sessions') return {
            select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mockSession, error: null }) })) })) })),
          }
          return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) })) })) })) }
        }),
        rpc: vi.fn().mockResolvedValue({ error: null }),
      } as any)

      const res = await POST(makeFormRequest({ session_id: 'sess-3', panic_text: 'Hello' }))
      expect(res.status).not.toBe(429)
    })
  })

  it('restricts vocabulary in the system prompt when guided_vocab is provided', async () => {
    const { POST } = await import('@/app/api/conversation/route')
    const form = new FormData()
    form.append('session_id', 'session-1')
    form.append('panic_text', 'My name is Ana')
    form.append('guided_vocab', JSON.stringify(['name', 'hello']))

    const request = new Request('http://localhost/api/conversation', { method: 'POST', body: form })
    const res = await POST(request)
    expect(res.status).toBe(200)

    const promptArg = mockChatCreate.mock.calls[0][0]
    const systemMessage = promptArg.messages.find((m: { role: string }) => m.role === 'system')
    expect(systemMessage.content).toContain('name, hello')
    expect(systemMessage.content).toContain('only use vocabulary from this list')
  })

  it('suppresses the generic teaching-anatomy/topic instructions when guided_vocab is provided', async () => {
    const { POST } = await import('@/app/api/conversation/route')
    const form = new FormData()
    form.append('session_id', 'session-1')
    form.append('panic_text', 'My name is Ana')
    form.append('guided_vocab', JSON.stringify(['name', 'hello']))

    const request = new Request('http://localhost/api/conversation', { method: 'POST', body: form })
    const res = await POST(request)
    expect(res.status).toBe(200)

    const promptArg = mockChatCreate.mock.calls[mockChatCreate.mock.calls.length - 1][0]
    const systemMessage = promptArg.messages.find((m: { role: string }) => m.role === 'system')
    expect(systemMessage.content).not.toContain('TEACH BEFORE YOU TEST')
    expect(systemMessage.content).not.toContain('Session anatomy')
    expect(systemMessage.content).toContain('only use vocabulary from this list')
  })

  it('marks the exchange as a challenge in the system prompt when is_challenge is true', async () => {
    const { POST } = await import('@/app/api/conversation/route')
    const form = new FormData()
    form.append('session_id', 'session-1')
    form.append('panic_text', 'My name is Ana')
    form.append('guided_vocab', JSON.stringify(['name']))
    form.append('is_challenge', 'true')

    const request = new Request('http://localhost/api/conversation', { method: 'POST', body: form })
    await POST(request)

    const promptArg = mockChatCreate.mock.calls[mockChatCreate.mock.calls.length - 1][0]
    const systemMessage = promptArg.messages.find((m: { role: string }) => m.role === 'system')
    expect(systemMessage.content).toContain('final challenge')
  })

  it('injects the NPC persona block into the system prompt for a first encounter when session.npc_key is set', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
      rpc: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn((table: string) => {
        if (table === 'sessions') return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { ...mockSession, npc_key: 'anna' }, error: null }),
              })),
            })),
          })),
        }
        if (table === 'users') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: mockUserData, error: null }) })) })),
        }
        if (table === 'subscriptions') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })),
        }
        if (table === 'usage_log') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ gte: vi.fn().mockResolvedValue({ data: [], error: null }) })) })),
        }
        if (table === 'session_memory') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })) })),
        }
        if (table === 'errors_log') return {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
        if (table === 'messages') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })) })) })),
          insert: mockMessagesInsert,
        }
        if (table === 'vocab_log') return { upsert: vi.fn().mockResolvedValue({ error: null }) }
        if (table === 'npc_encounters') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })),
        }
        return {}
      }),
    } as any)

    const audio = new Blob(['fake-audio'], { type: 'audio/webm' })
    const res = await POST(makeFormRequest({ session_id: 'session-1', audio }))
    expect(res.status).toBe(200)

    const promptArg = mockChatCreate.mock.calls[0][0]
    const systemMessage = promptArg.messages.find((m: { role: string }) => m.role === 'system')
    expect(systemMessage.content).toContain('You are NOT Mr. Jake the teacher')
    expect(systemMessage.content).toContain('voicing Anna')
    expect(systemMessage.content).toContain('first time you are meeting this student')
  })

  it('mentions the last encounter summary in the system prompt when the student has met the NPC before', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
      rpc: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn((table: string) => {
        if (table === 'sessions') return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { ...mockSession, npc_key: 'anna' }, error: null }),
              })),
            })),
          })),
        }
        if (table === 'users') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: mockUserData, error: null }) })) })),
        }
        if (table === 'subscriptions') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })),
        }
        if (table === 'usage_log') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ gte: vi.fn().mockResolvedValue({ data: [], error: null }) })) })),
        }
        if (table === 'session_memory') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })) })),
        }
        if (table === 'errors_log') return {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
        if (table === 'messages') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })) })) })),
          insert: mockMessagesInsert,
        }
        if (table === 'vocab_log') return { upsert: vi.fn().mockResolvedValue({ error: null }) }
        if (table === 'npc_encounters') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { encounter_count: 3, last_summary_pt: 'Comprou uma camisa azul.' }, error: null }) })) })) })),
        }
        return {}
      }),
    } as any)

    const audio = new Blob(['fake-audio'], { type: 'audio/webm' })
    const res = await POST(makeFormRequest({ session_id: 'session-1', audio }))
    expect(res.status).toBe(200)

    const promptArg = mockChatCreate.mock.calls[0][0]
    const systemMessage = promptArg.messages.find((m: { role: string }) => m.role === 'system')
    expect(systemMessage.content).toContain('met this student before (3')
    expect(systemMessage.content).toContain('Comprou uma camisa azul.')
  })

  it('does not inject an NPC block when session.npc_key is absent', async () => {
    const audio = new Blob(['fake-audio'], { type: 'audio/webm' })
    const res = await POST(makeFormRequest({ session_id: 'session-1', audio }))
    expect(res.status).toBe(200)

    const promptArg = mockChatCreate.mock.calls[0][0]
    const systemMessage = promptArg.messages.find((m: { role: string }) => m.role === 'system')
    expect(systemMessage.content).not.toContain('ROLEPLAY CHARACTER')
  })
})
