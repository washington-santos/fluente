// @vitest-environment node
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockMessage = { id: 'msg-1', text: 'Hi Ana!', session_id: 'session-1', role: 'assistant' }
const mockSession = { id: 'session-1', user_id: 'user-1', teacher: { slug: 'mr-jake', avatar_image_url: '/avatars/mr-jake.png' } }

const { mockCreateDidTalk, mockUpdate } = vi.hoisted(() => ({
  mockCreateDidTalk: vi.fn(),
  mockUpdate: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
}))

vi.mock('@/lib/did', () => ({
  createDidTalk: mockCreateDidTalk,
  DID_VOICE_IDS: { 'mr-jake': 'en-US-GuyNeural' },
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
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
  return new Request('http://localhost/api/conversation/avatar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

import { POST } from '@/app/api/conversation/avatar/route'

describe('POST /api/conversation/avatar', () => {
  const originalEnv = process.env
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    process.env = { ...originalEnv, EF_PUBLIC_ORIGIN: 'https://app.example.com' }
  })
  afterEach(() => { process.env = originalEnv })

  it('returns skipped immediately when EF_PUBLIC_ORIGIN is not configured', async () => {
    process.env.EF_PUBLIC_ORIGIN = ''
    const res = await POST(jsonRequest({ message_id: 'msg-1' }))
    const body = await res.json()
    expect(body.video_status).toBe('skipped')
    expect(body.talk_id).toBeNull()
    expect(mockCreateDidTalk).not.toHaveBeenCalled()
  })

  it('returns the talk_id and pending status on success', async () => {
    mockCreateDidTalk.mockResolvedValue('tlk_123')
    const res = await POST(jsonRequest({ message_id: 'msg-1' }))
    const body = await res.json()
    expect(body.talk_id).toBe('tlk_123')
    expect(body.video_status).toBe('pending')
  })

  it('returns failed status when D-ID create fails', async () => {
    mockCreateDidTalk.mockResolvedValue(null)
    const res = await POST(jsonRequest({ message_id: 'msg-1' }))
    const body = await res.json()
    expect(body.talk_id).toBeNull()
    expect(body.video_status).toBe('failed')
  })

  it('returns 400 when message_id is missing', async () => {
    const res = await POST(jsonRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const res = await POST(jsonRequest({ message_id: 'msg-1' }))
    expect(res.status).toBe(401)
  })
})
