// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockTeacher = { id: 'teacher-1', slug: 'mrs-carol', name: 'Mrs. Carol', system_prompt: 'You are...', tts_voice: 'alloy', tts_provider: 'openai', avatar_image_url: '/avatars/mrs-carol.png', levels: ['A1', 'A2'], correction_style: 'gentle', memory_prefix: 'Mrs. Carol remembers:' }
const mockSession = { id: 'session-1', user_id: 'user-1', teacher_id: 'teacher-1', mode: 'daily', started_at: '2026-01-01T00:00:00Z', ended_at: null, duration_seconds: null }

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    from: vi.fn((table: string) => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null }),
        })),
      })),
      select: vi.fn((col: string, opts?: { count?: string }) => {
        if (opts?.count === 'exact') {
          // count query: .select('id', { count: 'exact', head: true }).eq().not()
          return {
            eq: vi.fn(() => ({
              not: vi.fn(() => Promise.resolve({ count: 3, error: null })),
            })),
          }
        }
        return {
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: mockTeacher, error: null }),
            // Second .eq() chained for teacher_id filter (session GET) or user_id (session end)
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { ...mockSession, teacher: mockTeacher },
                      error: null,
                    }),
                  })),
                })),
              })),
              // Fix 9: support select('id').eq().eq().maybeSingle() for ownership check
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null }),
            })),
            is: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { ...mockSession, teacher: mockTeacher },
                    error: null,
                  }),
                })),
              })),
            })),
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
            not: vi.fn(() => Promise.resolve({ count: 3, error: null })),
          })),
        }
      }),
      // Fix 4: update chains .select('id') — resolves to { data: [...], error: null }
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn().mockResolvedValue({ data: [{ id: 'session-1' }], error: null }),
          })),
        })),
      })),
    })),
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

describe('POST /api/session', () => {
  beforeEach(() => vi.resetModules())

  it('creates a session and returns session_id + teacher', async () => {
    const { POST } = await import('@/app/api/session/route')
    const req = new Request('http://localhost/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacher_id: 'teacher-1' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.session_id).toBe('session-1')
    expect(body.teacher.id).toBe('teacher-1')
    expect(body).toHaveProperty('topic')
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const { POST } = await import('@/app/api/session/route')
    const req = new Request('http://localhost/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacher_id: 'teacher-1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

describe('GET /api/session', () => {
  beforeEach(() => vi.resetModules())

  it('returns the latest active session with teacher', async () => {
    const { GET } = await import('@/app/api/session/route')
    const res = await GET(new Request('http://localhost/api/session?teacher_id=teacher-1'))
    const body = await res.json()
    expect(body.session.id).toBe('session-1')
    expect(body.session.teacher.slug).toBe('mrs-carol')
  })
})

describe('PATCH /api/session/[id]/end', () => {
  beforeEach(() => vi.resetModules())

  it('sets ended_at and duration_seconds', async () => {
    const { PATCH } = await import('@/app/api/session/[id]/end/route')
    const req = new Request('http://localhost/api/session/session-1/end', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_seconds: 300 }),
    })
    const res = await PATCH(req, { params: { id: 'session-1' } })
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
