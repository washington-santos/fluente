// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { cefr_level: 'A1' }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

describe('GET /api/mission', () => {
  beforeEach(() => vi.resetModules())

  it('returns mission and completed=false for a fresh day', async () => {
    const { GET } = await import('@/app/api/mission/route')
    const res = await GET(new Request('http://localhost/api/mission'))
    const body = await res.json()
    expect(body.mission).toBeDefined()
    expect(body.mission.key).toMatch(/^a1-/)
    expect(body.completed).toBe(false)
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const { GET } = await import('@/app/api/mission/route')
    const res = await GET(new Request('http://localhost/api/mission'))
    expect(res.status).toBe(401)
  })
})
