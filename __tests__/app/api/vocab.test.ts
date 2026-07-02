// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, PATCH } from '@/app/api/vocab/route'

const mockUser = { id: 'user-1' }
const mockVocabCard = {
  id: 'vocab-1',
  word: 'negotiate',
  definition: 'to discuss terms to reach agreement',
  review_count: 0,
  next_review_at: new Date(Date.now() - 1000).toISOString(),
}

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    from: vi.fn((table: string) => {
      if (table === 'vocab_log') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [mockVocabCard], error: null }),
          update: vi.fn().mockReturnThis(),
          match: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      return {}
    }),
  }),
}))

describe('GET /api/vocab', () => {
  it('returns due vocab cards', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.vocabCards).toHaveLength(1)
    expect(body.vocabCards[0].word).toBe('negotiate')
  })
})

describe('PATCH /api/vocab', () => {
  it('advances review count when knewIt=true', async () => {
    const req = new Request('http://localhost/api/vocab', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vocabId: 'vocab-1', knewIt: true, currentReviewCount: 0 }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('resets review count when knewIt=false', async () => {
    const req = new Request('http://localhost/api/vocab', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vocabId: 'vocab-1', knewIt: false, currentReviewCount: 3 }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
