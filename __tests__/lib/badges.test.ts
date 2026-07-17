import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkAndAwardBadges, BADGE_DEFINITIONS } from '@/lib/badges'

// Thenable chain: every method returns the chain itself so calls can be
// chained in any order, and awaiting the chain at any point resolves to
// the fixed `result` — mirrors how the real supabase-js query builder
// resolves without a dedicated terminal method for count/head queries.
function makeChain(result: { data?: unknown; count?: number | null; error?: unknown } = {}) {
  const resolved = { data: null, count: null, error: null, ...result }
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(resolved)),
    upsert: vi.fn(() => chain),
    then: (onFulfilled: (v: typeof resolved) => unknown) => Promise.resolve(resolved).then(onFulfilled),
  }
  return chain
}

describe('BADGE_DEFINITIONS', () => {
  it('has exactly 10 medals', () => {
    expect(BADGE_DEFINITIONS).toHaveLength(10)
  })
})

describe('checkAndAwardBadges', () => {
  let mockFrom: ReturnType<typeof vi.fn>
  let chains: Record<string, ReturnType<typeof makeChain>>

  beforeEach(() => {
    chains = {
      sessions: makeChain({ count: 0 }),
      users: makeChain({ data: { streak_days: 0, missions_completed_count: 0 } }),
      user_topic_progress: makeChain({ count: 0 }),
      level_history: makeChain({ count: 0 }),
      topic_assessments: makeChain({ data: [] }),
      user_badges: makeChain({ data: [] }),
    }
    mockFrom = vi.fn((table: string) => chains[table] ?? makeChain({}))
  })

  const supabase = () => ({ from: mockFrom }) as never

  it('returns an empty array when no criteria are met, and never touches user_badges', async () => {
    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalledWith('user_badges')
  })

  it('awards primeira_conversa when the user has at least one session with duration_seconds > 0', async () => {
    chains.sessions = makeChain({ count: 1 })
    mockFrom.mockImplementation((table: string) => chains[table] ?? makeChain({}))
    chains.user_badges = makeChain({ data: [{ badge_key: 'primeira_conversa' }] })

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual(['primeira_conversa'])
    expect(chains.user_badges.upsert).toHaveBeenCalledWith(
      [{ user_id: 'u1', badge_key: 'primeira_conversa' }],
      { onConflict: 'user_id,badge_key', ignoreDuplicates: true },
    )
  })

  it('awards both sequencia_3 and sequencia_7 (but not sequencia_30) when streak_days is 10', async () => {
    chains.users = makeChain({ data: { streak_days: 10, missions_completed_count: 0 } })
    chains.user_badges = makeChain({ data: [{ badge_key: 'sequencia_3' }, { badge_key: 'sequencia_7' }] })
    mockFrom.mockImplementation((table: string) => chains[table] ?? makeChain({}))

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result.sort()).toEqual(['sequencia_3', 'sequencia_7'])
  })

  it('awards primeiro_topico_dominado but not cinco_topicos_dominados when 2 topics are mastered', async () => {
    chains.user_topic_progress = makeChain({ count: 2 })
    chains.user_badges = makeChain({ data: [{ badge_key: 'primeiro_topico_dominado' }] })
    mockFrom.mockImplementation((table: string) => chains[table] ?? makeChain({}))

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual(['primeiro_topico_dominado'])
  })

  it('awards subiu_de_nivel when level_history has an auto_promotion row', async () => {
    chains.level_history = makeChain({ count: 1 })
    chains.user_badges = makeChain({ data: [{ badge_key: 'subiu_de_nivel' }] })
    mockFrom.mockImplementation((table: string) => chains[table] ?? makeChain({}))

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual(['subiu_de_nivel'])
  })

  it('awards pronuncia_afiada and perfeccionista independently based on topic_assessments rows', async () => {
    chains.topic_assessments = makeChain({
      data: [
        { pronunciation: 92, final_score: 70 },
        { pronunciation: 60, final_score: 60 },
      ],
    })
    chains.user_badges = makeChain({ data: [{ badge_key: 'pronuncia_afiada' }] })
    mockFrom.mockImplementation((table: string) => chains[table] ?? makeChain({}))

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual(['pronuncia_afiada'])
  })

  it('awards dez_missoes when missions_completed_count is at least 10', async () => {
    chains.users = makeChain({ data: { streak_days: 0, missions_completed_count: 10 } })
    chains.user_badges = makeChain({ data: [{ badge_key: 'dez_missoes' }] })
    mockFrom.mockImplementation((table: string) => chains[table] ?? makeChain({}))

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual(['dez_missoes'])
  })

  it('is idempotent: a badge already earned is not returned again even if its criterion is still met', async () => {
    chains.sessions = makeChain({ count: 1 })
    // Simulates ignoreDuplicates: the row conflicted, so RETURNING is empty.
    chains.user_badges = makeChain({ data: [] })
    mockFrom.mockImplementation((table: string) => chains[table] ?? makeChain({}))

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual([])
  })

  it('resolves to [] and logs, rather than throwing, when a query promise rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') {
        return { select: () => ({ eq: () => ({ gt: () => Promise.reject(new Error('network error')) }) }) }
      }
      return chains[table] ?? makeChain({})
    })

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual([])
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('resolves to [] and logs when the user_badges upsert itself errors', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    chains.sessions = makeChain({ count: 1 })
    chains.user_badges = makeChain({ data: null, error: { message: 'insert failed' } })
    mockFrom.mockImplementation((table: string) => chains[table] ?? makeChain({}))

    const result = await checkAndAwardBadges(supabase(), 'u1')
    expect(result).toEqual([])
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
