// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockUserData = { id: 'user-1', name: 'Ana', cefr_level: 'B1', teacher_id: 'teacher-1' }
const mockSession = { id: 'session-1', user_id: 'user-1', teacher_id: 'teacher-1', teacher: { id: 'teacher-1', slug: 'mr-jake', name: 'Mr. Jake', system_prompt: 'You are Mr. Jake.', tts_voice: 'echo', avatar_image_url: '/avatars/mr-jake.png' } }

// Hoist so the fn reference is available inside the vi.mock factory below
const { mockAnthropicCreate } = vi.hoisted(() => ({
  mockAnthropicCreate: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '{"reply":"Hi Ana!","correction":{"error_detected":false,"error_text":null,"correct_form":null,"error_type":null}}' }],
    usage: { input_tokens: 100, output_tokens: 50 },
  }),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
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
      if (table === 'messages') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })) })) })),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }
      if (table === 'usage_log') return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
        })),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }
      return {}
    }),
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

// Use class-based mocks so `new OpenAI()` / `new Anthropic()` work correctly in vitest v4
vi.mock('openai', () => ({
  default: class MockOpenAI {
    audio = {
      transcriptions: { create: vi.fn().mockResolvedValue({ text: 'Hello teacher.' }) },
      speech: { create: vi.fn().mockResolvedValue({ arrayBuffer: async () => Buffer.from('mp3').buffer }) },
    }
  },
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: mockAnthropicCreate,
    }
  },
}))

vi.mock('@/lib/did', () => ({
  createTalk: vi.fn().mockResolvedValue(null),
  DID_VOICE_IDS: { 'mr-jake': 'en-US-GuyNeural' },
}))

function makeFormRequest(fields: Record<string, string | Blob>) {
  const form = new FormData()
  Object.entries(fields).forEach(([k, v]) => form.append(k, v))
  return new Request('http://localhost/api/conversation', { method: 'POST', body: form })
}

import { POST } from '@/app/api/conversation/route'

describe('POST /api/conversation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns text, audio_url, and had_correction=false on clean turn', async () => {
    const audio = new Blob(['fake-audio'], { type: 'audio/webm' })
    const res = await POST(makeFormRequest({ session_id: 'session-1', audio }))
    const body = await res.json()
    expect(body.text).toBe('Hi Ana!')
    expect(body.audio_url).toMatch(/^data:audio\/mp3;base64,/)
    expect(body.had_correction).toBe(false)
  })

  it('handles panic_text instead of audio', async () => {
    const res = await POST(makeFormRequest({ session_id: 'session-1', panic_text: 'I go to school yesterday.' }))
    const body = await res.json()
    expect(body.text).toBe('Hi Ana!')
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
        if (table === 'messages') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })) })) })),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
        if (table === 'usage_log') return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
          })),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        }
        return {}
      }),
    } as any)

    await POST(makeFormRequest({ session_id: 'session-1', panic_text: 'Hello.' }))

    const callArgs = mockAnthropicCreate.mock.calls[0][0]
    expect(callArgs.system).toContain('Student likes coding.')
  })
})
