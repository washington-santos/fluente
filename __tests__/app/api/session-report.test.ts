// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

import { GET } from '@/app/api/session/[id]/report/route'

// Creates a chainable query builder that is also thenable (Promise-like).
// This lets `await chain.select().eq()` work AND `chain.select().eq().single()` work.
const makeChain = (data: unknown, error: unknown = null): any => {
  const chain: any = {}
  chain.then = (resolve: any, reject: any) => Promise.resolve({ data, error }).then(resolve, reject)
  chain.catch = (fn: any) => Promise.resolve({ data, error }).catch(fn)
  chain.finally = (fn: any) => Promise.resolve({ data, error }).finally(fn)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue({ data, error })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  return chain
}

describe('GET /api/session/[id]/report', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(
      new Request('http://localhost/api/session/sess-1/report'),
      { params: { id: 'sess-1' } }
    )
    expect(res.status).toBe(401)
  })

  it('returns correct counts from session messages', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const mockMessages = [
      { role: 'user', had_correction: false, pronunciation_hint: null },
      { role: 'assistant', had_correction: true, pronunciation_hint: 'Buzz the th sound.' },
      { role: 'user', had_correction: false, pronunciation_hint: null },
      { role: 'assistant', had_correction: false, pronunciation_hint: null },
    ]

    const sessionChain = makeChain({
      id: 'sess-1',
      user_id: 'user-1',
      duration_seconds: 300,
      started_at: '2026-07-01T10:00:00Z',
    })
    const userChain = makeChain({ cefr_level: 'B1' })
    const missionLogChain = makeChain(null) // no completed mission log
    const messagesChain = makeChain(mockMessages)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') return sessionChain
      if (table === 'users') return userChain
      if (table === 'messages') return messagesChain
      if (table === 'daily_missions_log') return missionLogChain
      return makeChain(null)
    })

    const res = await GET(
      new Request('http://localhost/api/session/sess-1/report'),
      { params: { id: 'sess-1' } }
    )
    const body = await res.json()
    expect(body.userMessages).toBe(2)
    expect(body.corrections).toBe(1)
    expect(body.pronunciationHints).toBe(1)
    expect(body.durationSeconds).toBe(300)
    expect(typeof body.missionCompleted).toBe('boolean')
    expect(typeof body.missionTitle).toBe('string')
  })

  it('returns 404 when session not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const sessionChain = makeChain(null)
    mockFrom.mockReturnValue(sessionChain)

    const res = await GET(
      new Request('http://localhost/api/session/nonexistent/report'),
      { params: { id: 'nonexistent' } }
    )
    expect(res.status).toBe(404)
  })
})
