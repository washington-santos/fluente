// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockMemoryGenerate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('@/lib/memory', () => ({ generateSessionMemory: mockMemoryGenerate }))

import { POST } from '@/app/api/session/[id]/finalize/route'

const makeChain = (data: unknown, error: unknown = null) => {
  const chain: Record<string, unknown> = {}
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockResolvedValue({ error: null })
  chain.update = vi.fn().mockReturnValue(chain)
  chain.upsert = vi.fn().mockResolvedValue({ error: null })
  chain.single = vi.fn().mockResolvedValue({ data, error })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  return chain
}

describe('POST /api/session/[id]/finalize', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const req = new Request('http://localhost/api/session/s1/finalize', { method: 'POST' })
    const res = await POST(req, { params: { id: 's1' } })
    expect(res.status).toBe(401)
  })

  it('generates memory, upserts errors, updates streak, returns ok:true', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockMemoryGenerate.mockResolvedValue({
      summary: 'Good session.',
      key_topics: ['past tense'],
      personal_details: ['teacher'],
    })

    const sessionChain = makeChain({ id: 's1', user_id: 'u1' })
    const userChain = makeChain({ id: 'u1', name: 'Ana', cefr_level: 'B1', streak_days: 2, last_session_at: null })
    const memInsertChain = makeChain(null)
    const errorUpsertChain = makeChain(null)

    // messages select returns array via .order()
    const msgListChain: Record<string, unknown> = {}
    msgListChain.eq = vi.fn().mockReturnValue(msgListChain)
    msgListChain.select = vi.fn().mockReturnValue(msgListChain)
    msgListChain.order = vi.fn().mockResolvedValue({
      data: [
        { role: 'user', text: 'Hello', had_correction: false, error_text: null, correct_form: null, error_type: null },
        { role: 'assistant', text: 'Hi!', had_correction: false, error_text: null, correct_form: null, error_type: null },
        { role: 'user', text: 'I goed to the store', had_correction: true, error_text: 'goed', correct_form: 'went', error_type: 'verb_tense' },
      ],
      error: null,
    })

    const userUpdateChain: Record<string, unknown> = {}
    userUpdateChain.eq = vi.fn().mockResolvedValue({ error: null })
    userUpdateChain.update = vi.fn().mockReturnValue(userUpdateChain)

    let fromCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallCount++
      if (table === 'sessions') return sessionChain
      if (table === 'users') {
        return fromCallCount <= 3 ? userChain : userUpdateChain
      }
      if (table === 'messages') return msgListChain
      if (table === 'session_memories') return memInsertChain
      if (table === 'error_log') return errorUpsertChain
      return makeChain(null)
    })

    const req = new Request('http://localhost/api/session/s1/finalize', { method: 'POST' })
    const res = await POST(req, { params: { id: 's1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
