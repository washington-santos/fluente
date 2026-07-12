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

// Use class-based mock so `new OpenAI()` works correctly in vitest v4
const mockChatCreate = vi.hoisted(() => vi.fn())
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: { create: mockChatCreate },
    }
  },
}))

import { POST } from '@/app/api/session/[id]/assess/route'

// Creates a chainable query builder supporting select/eq/order plus
// terminal single/maybeSingle/insert/upsert resolutions.
const makeChain = (data: unknown, error: unknown = null): Record<string, unknown> => {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockResolvedValue({ data, error })
  chain.single = vi.fn().mockResolvedValue({ data, error })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  chain.insert = vi.fn().mockResolvedValue({ error: null })
  chain.upsert = vi.fn().mockResolvedValue({ error: null })
  return chain
}

describe('POST /api/session/[id]/assess', () => {
  beforeEach(() => vi.clearAllMocks())

  it('short-circuits with too_short for a mission slug that is not a real curriculum topic', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    const sessionChain = makeChain({
      id: 'sess-1',
      user_id: 'u1',
      topic: 'b1-hobby',
      lesson_topic_id: 'b1-hobby',
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') return sessionChain
      // Should not be reached, but return something harmless if it is.
      return makeChain(null)
    })

    const res = await POST(
      new Request('http://localhost/api/session/sess-1/assess', { method: 'POST' }),
      { params: { id: 'sess-1' } },
    )
    const body = await res.json()

    expect(body).toEqual({ too_short: true, message: 'Sem tópico nesta sessão.' })
    expect(mockChatCreate).not.toHaveBeenCalled()
  })

  it('proceeds with assessment when topicId is a real curriculum topic key', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    const sessionChain = makeChain({
      id: 'sess-1',
      user_id: 'u1',
      topic: 'travel',
      lesson_topic_id: 'travel',
    })
    const userChain = makeChain({ name: 'Maria', cefr_level: 'B1' })
    const messagesChain = makeChain([
      { role: 'user', text: 'I went to Portugal last year.' },
      { role: 'assistant', text: 'That sounds amazing! Tell me more.' },
      { role: 'user', text: 'I visited Lisbon and Porto.' },
      { role: 'assistant', text: 'Did you enjoy the food?' },
      { role: 'user', text: 'Yes, I loved it a lot.' },
    ])
    const progressChain = makeChain(null) // no existing progress row
    const assessmentsInsertChain = makeChain(null)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') return sessionChain
      if (table === 'users') return userChain
      if (table === 'messages') return messagesChain
      if (table === 'user_topic_progress') return progressChain
      if (table === 'topic_assessments') return assessmentsInsertChain
      return makeChain(null)
    })

    mockChatCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              speaking: 75,
              listening: 80,
              pronunciation: 70,
              vocabulary: 78,
              grammar: 72,
              confidence: 80,
              fluency: 74,
              feedback_pt: 'Você foi muito bem!',
              highlight_pt: 'Ótimo vocabulário.',
            }),
          },
        },
      ],
    })

    const res = await POST(
      new Request('http://localhost/api/session/sess-1/assess', { method: 'POST' }),
      { params: { id: 'sess-1' } },
    )
    const body = await res.json()

    expect(body.too_short).toBeUndefined()
    expect(mockChatCreate).toHaveBeenCalledTimes(1)
    expect(body.scores).toBeDefined()
    expect(typeof body.final_score).toBe('number')
  })
})
