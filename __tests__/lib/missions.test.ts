// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockChatCreate = vi.hoisted(() => vi.fn())

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockChatCreate } }
  },
}))

vi.mock('@/lib/student-context', () => ({
  getStudentContext: vi.fn().mockResolvedValue({
    userId: 'user-1',
    name: 'Ana',
    cefrLevel: 'B1',
    personalContext: [],
    goal: 'travel',
    focusAreas: [],
    taughtTopicIds: [],
    topicsNeedingReview: [],
    frequentErrors: [],
    recentSessionSummary: null,
    biggestDifficulty: null,
    streakDays: 0,
  }),
}))

import { getOrGenerateTodaysMission } from '@/lib/missions'

// Chainable + thenable mock query builder, matching the convention already
// used in __tests__/app/api/session-report.test.ts.
const makeChain = (data: unknown, error: unknown = null): any => {
  const chain: any = {}
  chain.then = (resolve: any, reject: any) => Promise.resolve({ data, error }).then(resolve, reject)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockResolvedValue({ data: null, error: null })
  chain.single = vi.fn().mockResolvedValue({ data, error })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  return chain
}

function makeSupabase(userRow: unknown, existingMissionRow: unknown) {
  const userChain = makeChain(userRow)
  const missionChain = makeChain(existingMissionRow)
  const from = vi.fn((table: string) => {
    if (table === 'users') return userChain
    if (table === 'daily_missions_log') return missionChain
    return makeChain(null)
  })
  return { from, missionChain }
}

describe('getOrGenerateTodaysMission', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the existing row for today without calling the AI', async () => {
    const { from } = makeSupabase(
      { cefr_level: 'B1' },
      { mission_key: 'b1-movie', title_pt: 'Recomendação cultural', description_pt: 'Recomende um filme.', completed_at: null },
    )
    const result = await getOrGenerateTodaysMission('user-1', { from } as any)
    expect(result).toEqual({
      missionKey: 'b1-movie',
      titlePt: 'Recomendação cultural',
      descriptionPt: 'Recomende um filme.',
      minUserTurns: 5,
      completed: false,
    })
    expect(mockChatCreate).not.toHaveBeenCalled()
  })

  it('marks completed:true when the existing row has completed_at set', async () => {
    const { from } = makeSupabase(
      { cefr_level: 'A1' },
      { mission_key: 'a1-intro', title_pt: 'Apresentação', description_pt: 'Apresente-se.', completed_at: '2026-07-11T09:00:00Z' },
    )
    const result = await getOrGenerateTodaysMission('user-1', { from } as any)
    expect(result.completed).toBe(true)
    expect(result.minUserTurns).toBe(3)
  })

  it('generates and persists a new mission via AI when none exists for today', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: '{"mission_key":"b1-hobby","title_pt":"Seu hobby favorito","description_pt":"Fale sobre um hobby que você pratica."}' } }],
    })
    const { from, missionChain } = makeSupabase({ cefr_level: 'B1' }, null)

    const result = await getOrGenerateTodaysMission('user-1', { from } as any)

    expect(result).toEqual({
      missionKey: 'b1-hobby',
      titlePt: 'Seu hobby favorito',
      descriptionPt: 'Fale sobre um hobby que você pratica.',
      minUserTurns: 5,
      completed: false,
    })
    expect(missionChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        mission_key: 'b1-hobby',
        title_pt: 'Seu hobby favorito',
        description_pt: 'Fale sobre um hobby que você pratica.',
      }),
    )
  })

  it('falls back to a static per-level mission and still persists a row when the AI call throws', async () => {
    mockChatCreate.mockRejectedValue(new Error('network down'))
    const { from, missionChain } = makeSupabase({ cefr_level: 'C1' }, null)

    const result = await getOrGenerateTodaysMission('user-1', { from } as any)

    expect(result.missionKey).toBe('c1-interview')
    expect(result.completed).toBe(false)
    expect(result.minUserTurns).toBe(8)
    expect(missionChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', mission_key: 'c1-interview' }),
    )
  })

  it('falls back to a static per-level mission when the AI returns unparseable JSON', async () => {
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: 'not json' } }] })
    const { from } = makeSupabase({ cefr_level: 'A2' }, null)

    const result = await getOrGenerateTodaysMission('user-1', { from } as any)

    expect(result.missionKey).toBe('a2-weekend')
    expect(result.minUserTurns).toBe(4)
  })

  it('defaults to A1 turns when cefr_level is missing', async () => {
    const { from } = makeSupabase(
      { cefr_level: null },
      { mission_key: 'a1-intro', title_pt: 'Apresentação', description_pt: 'Apresente-se.', completed_at: null },
    )
    const result = await getOrGenerateTodaysMission('user-1', { from } as any)
    expect(result.minUserTurns).toBe(3)
  })
})
