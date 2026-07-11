// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockMessage = { id: 'msg-1', session_id: 'session-1', did_talk_id: 'tlk_123', video_status: 'pending', video_url: null }
const mockSession = { id: 'session-1' }

const { mockPollDidTalk, mockUpdate, mockRpc } = vi.hoisted(() => ({
  mockPollDidTalk: vi.fn(),
  mockUpdate: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  mockRpc: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock('@/lib/did', () => ({ pollDidTalk: mockPollDidTalk }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    rpc: mockRpc,
    from: vi.fn((table: string) => {
      if (table === 'messages') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mockMessage, error: null }) })) })),
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

import { GET } from '@/app/api/conversation/avatar/[talkId]/route'

describe('GET /api/conversation/avatar/[talkId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const res = await GET(new Request('http://localhost/api/conversation/avatar/tlk_123'), { params: { talkId: 'tlk_123' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the talk does not belong to the caller', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
      from: vi.fn((table: string) => {
        if (table === 'messages') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })),
        }
        return {}
      }),
    } as any)
    const res = await GET(new Request('http://localhost/api/conversation/avatar/nope'), { params: { talkId: 'nope' } })
    expect(res.status).toBe(404)
  })

  it('polls D-ID and returns ready + video_url when done', async () => {
    mockPollDidTalk.mockResolvedValue({ status: 'done', resultUrl: 'https://d-id.com/video.mp4' })
    const res = await GET(new Request('http://localhost/api/conversation/avatar/tlk_123'), { params: { talkId: 'tlk_123' } })
    const body = await res.json()
    expect(body.status).toBe('ready')
    expect(body.video_url).toBe('https://d-id.com/video.mp4')
    expect(mockRpc).toHaveBeenCalledWith('increment_usage_log', expect.objectContaining({ p_did_credits: 1 }))
  })

  it('returns pending without polling D-ID again once already stored as ready', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
      rpc: mockRpc,
      from: vi.fn((table: string) => {
        if (table === 'messages') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { ...mockMessage, video_status: 'ready', video_url: 'https://d-id.com/cached.mp4' }, error: null }) })) })),
        }
        if (table === 'sessions') return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: mockSession, error: null }) })) })) })),
        }
        return {}
      }),
    } as any)
    const res = await GET(new Request('http://localhost/api/conversation/avatar/tlk_123'), { params: { talkId: 'tlk_123' } })
    const body = await res.json()
    expect(body.status).toBe('ready')
    expect(body.video_url).toBe('https://d-id.com/cached.mp4')
    expect(mockPollDidTalk).not.toHaveBeenCalled()
  })

  it('returns pending while D-ID is still processing', async () => {
    mockPollDidTalk.mockResolvedValue({ status: 'pending', resultUrl: null })
    const res = await GET(new Request('http://localhost/api/conversation/avatar/tlk_123'), { params: { talkId: 'tlk_123' } })
    const body = await res.json()
    expect(body.status).toBe('pending')
  })

  it('marks failed when D-ID reports an error', async () => {
    mockPollDidTalk.mockResolvedValue({ status: 'error', resultUrl: null })
    const res = await GET(new Request('http://localhost/api/conversation/avatar/tlk_123'), { params: { talkId: 'tlk_123' } })
    const body = await res.json()
    expect(body.status).toBe('failed')
  })
})
