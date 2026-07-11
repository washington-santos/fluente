// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockMessage = { id: 'msg-1', text: 'Hi Ana!', session_id: 'session-1', role: 'assistant' }
const mockSession = { id: 'session-1', user_id: 'user-1', teacher: { tts_voice: 'echo' } }

const { mockSynthesize, mockUpdate, mockUpload, mockRpc } = vi.hoisted(() => ({
  mockSynthesize: vi.fn(),
  mockUpdate: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  mockUpload: vi.fn().mockResolvedValue({ error: null }),
  mockRpc: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('@/lib/tts', () => ({ synthesizeTtsWithRetry: mockSynthesize }))

vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdmin: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.supabase.co/storage/v1/object/public/audio-replay/user-1/session-1/x.mp3' } }),
      })),
    },
  })),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    rpc: mockRpc,
    from: vi.fn((table: string) => {
      if (table === 'messages') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mockMessage, error: null }) })) })) })),
        update: mockUpdate,
      }
      if (table === 'sessions') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mockSession, error: null }) })) })) })),
      }
      return {}
    }),
  })),
}))

vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))

function jsonRequest(body: object) {
  return new Request('http://localhost/api/conversation/audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

import { POST } from '@/app/api/conversation/audio/route'

describe('POST /api/conversation/audio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    mockUpload.mockResolvedValue({ error: null })
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const res = await POST(jsonRequest({ message_id: 'msg-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when message_id is missing', async () => {
    const res = await POST(jsonRequest({}))
    expect(res.status).toBe(400)
  })

  it('synthesizes audio, uploads it, and marks the message ready', async () => {
    mockSynthesize.mockResolvedValue({ dataUrl: 'data:audio/mp3;base64,abc', buffer: Buffer.from('mp3') })
    const res = await POST(jsonRequest({ message_id: 'msg-1' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.audio_status).toBe('ready')
    expect(body.audio_url).toContain('audio-replay')
    expect(mockSynthesize).toHaveBeenCalledWith('Hi Ana!', 'echo')
  })

  it('falls back to the inline data URL when storage upload fails', async () => {
    mockSynthesize.mockResolvedValue({ dataUrl: 'data:audio/mp3;base64,abc', buffer: Buffer.from('mp3') })
    mockUpload.mockResolvedValueOnce({ error: { message: 'upload failed' } })
    const res = await POST(jsonRequest({ message_id: 'msg-1' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.audio_status).toBe('ready')
    expect(body.audio_url).toBe('data:audio/mp3;base64,abc')
  })

  it('marks the message failed and returns 502 when synthesis exhausts all retries', async () => {
    mockSynthesize.mockRejectedValue(new Error('OpenAI down'))
    const res = await POST(jsonRequest({ message_id: 'msg-1' }))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.audio_status).toBe('failed')
    expect(body.audio_url).toBeNull()
  })

  it('returns 404 when the message does not belong to the caller', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
      from: vi.fn((table: string) => {
        if (table === 'messages') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })),
        }
        return {}
      }),
    } as any)
    const res = await POST(jsonRequest({ message_id: 'not-mine' }))
    expect(res.status).toBe(404)
  })
})
