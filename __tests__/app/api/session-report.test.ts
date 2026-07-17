// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())
const mockChatCreate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    rpc: mockRpc,
  }),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockChatCreate } }
  },
}))

const mockCheckAndAwardBadges = vi.hoisted(() => vi.fn().mockResolvedValue([]))
vi.mock('@/lib/badges', () => ({
  checkAndAwardBadges: mockCheckAndAwardBadges,
}))

import { GET } from '@/app/api/session/[id]/report/route'

const makeChain = (data: unknown, error: unknown = null): any => {
  const chain: any = {}
  // Bare-awaiting the chain (no .single()/.maybeSingle()) mirrors Supabase's
  // row-array response shape, e.g. `.update(...).select('id')` resolving to
  // `{ data: [...] }`. `.single()`/`.maybeSingle()` keep the unwrapped value.
  const listData = Array.isArray(data) ? data : data == null ? [] : [data]
  chain.then = (resolve: any, reject: any) => Promise.resolve({ data: listData, error }).then(resolve, reject)
  chain.catch = (fn: any) => Promise.resolve({ data: listData, error }).catch(fn)
  chain.finally = (fn: any) => Promise.resolve({ data: listData, error }).finally(fn)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.is = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue({ data, error })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  return chain
}

function mockTables(opts: {
  sessionData?: unknown
  userData?: unknown
  missionData?: unknown
  messages?: unknown[]
}) {
  const sessionChain = makeChain(opts.sessionData ?? { id: 'sess-1', user_id: 'user-1', duration_seconds: 300, started_at: '2026-07-11T10:00:00Z' })
  const userChain = makeChain(opts.userData ?? { cefr_level: 'B1' })
  const missionChain = makeChain(opts.missionData ?? null)
  const messagesChain = makeChain(opts.messages ?? [])

  mockFrom.mockImplementation((table: string) => {
    if (table === 'sessions') return sessionChain
    if (table === 'users') return userChain
    if (table === 'daily_missions_log') return missionChain
    if (table === 'messages') return messagesChain
    return makeChain(null)
  })

  return { sessionChain, userChain, missionChain, messagesChain }
}

describe('GET /api/session/[id]/report', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ error: null })
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(new Request('http://localhost/api/session/sess-1/report'), { params: { id: 'sess-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when session not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockReturnValue(makeChain(null))
    const res = await GET(new Request('http://localhost/api/session/nonexistent/report'), { params: { id: 'nonexistent' } })
    expect(res.status).toBe(404)
  })

  it('returns correct message counts', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockTables({
      missionData: { mission_key: 'b1-movie', title_pt: 'Recomendação cultural', description_pt: 'Recomende um filme.', completed_at: null },
      messages: [
        { role: 'user', text: 'Hi', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Hi!', had_correction: true, pronunciation_hint: 'Buzz the th sound.' },
        { role: 'user', text: 'OK', had_correction: false, pronunciation_hint: null },
      ],
    })
    const res = await GET(new Request('http://localhost/api/session/sess-1/report'), { params: { id: 'sess-1' } })
    const body = await res.json()
    expect(body.userMessages).toBe(2)
    expect(body.corrections).toBe(1)
    expect(body.pronunciationHints).toBe(1)
    expect(body.durationSeconds).toBe(300)
    expect(body.missionTitle).toBe('Recomendação cultural')
  })

  it('includes newlyAwardedBadges from checkAndAwardBadges in the response', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCheckAndAwardBadges.mockResolvedValueOnce(['primeira_conversa'])
    mockTables({
      missionData: { mission_key: 'b1-movie', title_pt: 'Recomendação cultural', description_pt: 'Recomende um filme.', completed_at: null },
      messages: [
        { role: 'user', text: 'Hi', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Hi!', had_correction: true, pronunciation_hint: 'Buzz the th sound.' },
        { role: 'user', text: 'OK', had_correction: false, pronunciation_hint: null },
      ],
    })
    const res = await GET(new Request('http://localhost/api/session/sess-1/report'), { params: { id: 'sess-1' } })
    const body = await res.json()
    expect(mockCheckAndAwardBadges).toHaveBeenCalledWith(expect.anything(), 'user-1')
    expect(body.newlyAwardedBadges).toEqual(['primeira_conversa'])
  })

  it('does not call the AI when there are too few user turns', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockTables({
      userData: { cefr_level: 'B1' }, // minUserTurns = 5
      missionData: { mission_key: 'b1-movie', title_pt: 'Recomendação cultural', description_pt: 'Recomende um filme.', completed_at: null },
      messages: [
        { role: 'user', text: 'Hi', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Hello!', had_correction: false, pronunciation_hint: null },
      ],
    })
    const res = await GET(new Request('http://localhost/api/session/sess-1/report'), { params: { id: 'sess-1' } })
    const body = await res.json()
    expect(body.missionCompleted).toBe(false)
    expect(mockChatCreate).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('does not mark completed when the AI says the mission was not covered', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { missionChain } = mockTables({
      userData: { cefr_level: 'B1' },
      missionData: { mission_key: 'b1-movie', title_pt: 'Recomendação cultural', description_pt: 'Recomende um filme.', completed_at: null },
      messages: [
        { role: 'user', text: 'I like pizza', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Nice, tell me more', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'Yes very much', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'What else do you like?', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'I like pasta too', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Cool', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'Yes', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Anything else?', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'OK bye', had_correction: false, pronunciation_hint: null },
      ],
    })
    // 5 user turns meets B1's minUserTurns floor, so the AI verdict below is what
    // actually decides the outcome — not the floor.
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: '{"covered":false}' } }] })

    const res = await GET(new Request('http://localhost/api/session/sess-1/report'), { params: { id: 'sess-1' } })
    const body = await res.json()
    expect(mockChatCreate).toHaveBeenCalled()
    expect(body.missionCompleted).toBe(false)
    expect(missionChain.update).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('marks completed and increments the counter when the AI confirms coverage', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { missionChain } = mockTables({
      userData: { cefr_level: 'B1' },
      missionData: { mission_key: 'b1-movie', title_pt: 'Recomendação cultural', description_pt: 'Recomende um filme.', completed_at: null },
      messages: [
        { role: 'user', text: 'I recommend Inception', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Great choice, why?', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'I like it because of the plot twists', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'What else stood out?', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'It is very smart and well made', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Anything you disliked?', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'Not really, I loved it', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Would you recommend it to a friend?', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'Definitely, everyone should watch it', had_correction: false, pronunciation_hint: null },
      ],
    })
    // 5 user turns meets B1's minUserTurns floor, so the AI verdict below is what
    // actually decides the outcome — not the floor.
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: '{"covered":true}' } }] })

    const res = await GET(new Request('http://localhost/api/session/sess-1/report'), { params: { id: 'sess-1' } })
    const body = await res.json()
    expect(body.missionCompleted).toBe(true)
    expect(missionChain.update).toHaveBeenCalledWith(expect.objectContaining({ completed_at: expect.any(String) }))
    expect(missionChain.is).toHaveBeenCalledWith('completed_at', null)
    expect(mockRpc).toHaveBeenCalledWith('increment_missions_completed', { p_user_id: 'user-1' })
  })

  it('does not double-increment when a concurrent request already completed the mission', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { missionChain } = mockTables({
      userData: { cefr_level: 'B1' },
      missionData: { mission_key: 'b1-movie', title_pt: 'Recomendação cultural', description_pt: 'Recomende um filme.', completed_at: null },
      messages: [
        { role: 'user', text: 'I recommend Inception', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Great choice, why?', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'I like it because of the plot twists', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'What else stood out?', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'It is very smart and well made', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Anything you disliked?', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'Not really, I loved it', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'Would you recommend it to a friend?', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'Definitely, everyone should watch it', had_correction: false, pronunciation_hint: null },
      ],
    })
    // 5 user turns meets B1's minUserTurns floor, so the AI verdict below is what
    // actually decides the outcome — not the floor.
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: '{"covered":true}' } }] })
    // Simulate a concurrent request winning the race: the conditional update
    // (.is('completed_at', null)) affects zero rows because another request
    // already flipped completed_at first.
    missionChain.then = (resolve: any, reject: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject)

    const res = await GET(new Request('http://localhost/api/session/sess-1/report'), { params: { id: 'sess-1' } })
    const body = await res.json()
    expect(body.missionCompleted).toBe(true)
    expect(missionChain.update).toHaveBeenCalledWith(expect.objectContaining({ completed_at: expect.any(String) }))
    expect(missionChain.is).toHaveBeenCalledWith('completed_at', null)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('reports an already-completed mission without calling the AI again', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockTables({
      userData: { cefr_level: 'B1' },
      missionData: { mission_key: 'b1-movie', title_pt: 'Recomendação cultural', description_pt: 'Recomende um filme.', completed_at: '2026-07-11T09:00:00Z' },
      messages: [],
    })
    const res = await GET(new Request('http://localhost/api/session/sess-1/report'), { params: { id: 'sess-1' } })
    const body = await res.json()
    expect(body.missionCompleted).toBe(true)
    expect(mockChatCreate).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('treats an AI failure during verification as not covered, without throwing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockTables({
      userData: { cefr_level: 'B1' },
      missionData: { mission_key: 'b1-movie', title_pt: 'Recomendação cultural', description_pt: 'Recomende um filme.', completed_at: null },
      messages: [
        { role: 'user', text: 'a', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'b', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'c', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'd', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'e', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'f', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'g', had_correction: false, pronunciation_hint: null },
        { role: 'assistant', text: 'h', had_correction: false, pronunciation_hint: null },
        { role: 'user', text: 'i', had_correction: false, pronunciation_hint: null },
      ],
    })
    // 5 user turns meets B1's minUserTurns floor, so the AI call below is actually
    // attempted (and fails) rather than being skipped by the floor.
    mockChatCreate.mockRejectedValue(new Error('rate limited'))

    const res = await GET(new Request('http://localhost/api/session/sess-1/report'), { params: { id: 'sess-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(mockChatCreate).toHaveBeenCalled()
    expect(body.missionCompleted).toBe(false)
  })
})
