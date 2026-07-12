// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockGetOrGenerate = vi.hoisted(() => vi.fn())
const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/missions', () => ({ getOrGenerateTodaysMission: mockGetOrGenerate }))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

import { POST } from '@/app/api/mission/start/route'

const makeChain = (data: unknown, error: unknown = null): any => {
  const chain: any = {}
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.is = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue({ data, error })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  return chain
}

describe('POST /api/mission/start', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns 400 when the user has no teacher assigned', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeChain({ teacher_id: null, cefr_level: 'B1' })
      return makeChain(null)
    })
    const res = await POST()
    expect(res.status).toBe(400)
  })

  it('closes a dangling open session, creates a new one with the mission in lesson_plan_json, and returns its id', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockGetOrGenerate.mockResolvedValue({
      missionKey: 'b1-movie', titlePt: 'Recomendação cultural', descriptionPt: 'Recomende um filme.',
      minUserTurns: 5, completed: false,
    })

    const userChain = makeChain({ teacher_id: 'teacher-1', cefr_level: 'B1' })
    const closeDanglingChain = makeChain(null)
    closeDanglingChain.update = vi.fn().mockReturnValue(closeDanglingChain)
    const insertChain = makeChain({ id: 'session-99' })
    insertChain.insert = vi.fn().mockReturnValue(insertChain)

    let sessionsCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return userChain
      if (table === 'sessions') {
        sessionsCallCount++
        return sessionsCallCount === 1 ? closeDanglingChain : insertChain
      }
      return makeChain(null)
    })

    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.session_id).toBe('session-99')
    expect(closeDanglingChain.update).toHaveBeenCalledWith(expect.objectContaining({ ended_at: expect.any(String) }))
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        teacher_id: 'teacher-1',
        topic: 'b1-movie',
        lesson_topic_id: 'b1-movie',
        lesson_plan_json: expect.objectContaining({
          title_pt: 'Recomendação cultural',
          objective_pt: 'Recomende um filme.',
        }),
      }),
    )
  })
})
