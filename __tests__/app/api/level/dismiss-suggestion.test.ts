// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: mockGetUser },
    from: () => ({ update: mockUpdate }),
  }),
}))

import { POST } from '@/app/api/level/dismiss-suggestion/route'

describe('POST /api/level/dismiss-suggestion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(new Request('http://localhost/api/level/dismiss-suggestion', { method: 'POST' }))
    expect(res.status).toBe(401)
  })

  it('marks the suggestion dismissed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(new Request('http://localhost/api/level/dismiss-suggestion', { method: 'POST' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true })
    expect(mockUpdate).toHaveBeenCalledWith({ confirmation_suggestion_dismissed: true })
  })
})
