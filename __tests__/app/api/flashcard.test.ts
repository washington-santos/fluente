// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const mockCards = [
  { id: 'err-1', error_type: 'verb_tense', error_text: 'I goed to school', correct_form: 'I went to school', review_count: 0 },
  { id: 'err-2', error_type: 'vocabulary', error_text: 'He is very tall person', correct_form: 'He is a very tall person', review_count: 1 },
]

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            lte: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({ data: mockCards, error: null })),
              })),
            })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    })),
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

describe('GET /api/flashcard', () => {
  beforeEach(() => vi.resetModules())

  it('returns due flashcards', async () => {
    const { GET } = await import('@/app/api/flashcard/route')
    const res = await GET(new Request('http://localhost/api/flashcard'))
    const body = await res.json()
    expect(body.cards).toHaveLength(2)
    expect(body.cards[0].id).toBe('err-1')
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const { GET } = await import('@/app/api/flashcard/route')
    const res = await GET(new Request('http://localhost/api/flashcard'))
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/flashcard', () => {
  beforeEach(() => vi.resetModules())

  it('accepts knewIt=true and returns ok', async () => {
    const { PATCH } = await import('@/app/api/flashcard/route')
    const req = new Request('http://localhost/api/flashcard', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errorId: 'err-1', knewIt: true, currentReviewCount: 0 }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
