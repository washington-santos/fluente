// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockGetOrGenerate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/missions', () => ({ getOrGenerateTodaysMission: mockGetOrGenerate }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

import { GET } from '@/app/api/mission/route'

describe('GET /api/mission', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the mission for the authenticated user', async () => {
    mockGetOrGenerate.mockResolvedValue({
      missionKey: 'b1-movie', titlePt: 'Recomendação cultural', descriptionPt: 'Recomende um filme.',
      minUserTurns: 5, completed: false,
    })
    const res = await GET()
    const body = await res.json()
    expect(body.mission.missionKey).toBe('b1-movie')
    expect(body.mission.completed).toBe(false)
    expect(mockGetOrGenerate).toHaveBeenCalledWith('user-1', expect.anything())
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const res = await GET()
    expect(res.status).toBe(401)
  })
})
