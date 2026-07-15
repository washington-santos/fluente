import { describe, it, expect } from 'vitest'
import { CEFR_ORDER, levelBelow, isAtOrBelow } from '@/lib/levels'

describe('CEFR_ORDER', () => {
  it('is ordered from A1 to C2', () => {
    expect(CEFR_ORDER).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
  })
})

describe('levelBelow', () => {
  it('returns the previous level for a mid-range level', () => {
    expect(levelBelow('B1')).toBe('A2')
  })

  it('returns null for A1 (nothing below the floor)', () => {
    expect(levelBelow('A1')).toBeNull()
  })

  it('returns the level below C2', () => {
    expect(levelBelow('C2')).toBe('C1')
  })
})

describe('isAtOrBelow', () => {
  it('is true when candidate equals ceiling', () => {
    expect(isAtOrBelow('B1', 'B1')).toBe(true)
  })

  it('is true when candidate is below ceiling', () => {
    expect(isAtOrBelow('A1', 'B1')).toBe(true)
  })

  it('is false when candidate is above ceiling', () => {
    expect(isAtOrBelow('B2', 'B1')).toBe(false)
  })
})

import { downgradeLevel } from '@/lib/levels'

function makeChain(data: unknown) {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.single = () => Promise.resolve({ data, error: null })
  chain.update = () => chain
  chain.insert = (row: unknown) => { inserted.push(row); return Promise.resolve({ error: null }) }
  return chain
}

let inserted: unknown[]

describe('downgradeLevel', () => {
  it('returns null when there is no level below the current one', async () => {
    inserted = []
    const supabase = { from: () => makeChain({ reinforcement_target_level: null }) } as any
    const result = await downgradeLevel(supabase, 'u1', 'A1', 'manual_downgrade')
    expect(result).toBeNull()
  })

  it('sets reinforcement_target_level to the current level on a first downgrade', async () => {
    inserted = []
    const supabase = { from: () => makeChain({ reinforcement_target_level: null }) } as any
    const result = await downgradeLevel(supabase, 'u1', 'A2', 'manual_downgrade')
    expect(result).toEqual({ newLevel: 'A1', reinforcementTargetLevel: 'A2' })
  })

  it('preserves an existing reinforcement_target_level across repeated downgrades', async () => {
    inserted = []
    const supabase = { from: () => makeChain({ reinforcement_target_level: 'B1' }) } as any
    const result = await downgradeLevel(supabase, 'u1', 'A2', 'manual_downgrade')
    expect(result).toEqual({ newLevel: 'A1', reinforcementTargetLevel: 'B1' })
  })

  it('records a level_history row with the given reason', async () => {
    inserted = []
    const supabase = { from: () => makeChain({ reinforcement_target_level: null }) } as any
    await downgradeLevel(supabase, 'u1', 'B1', 'confirmation_suggestion_accepted')
    expect(inserted).toEqual([{
      user_id: 'u1', from_level: 'B1', to_level: 'A2', reason: 'confirmation_suggestion_accepted',
    }])
  })
})

import { shouldSuggestDowngrade } from '@/lib/levels'

describe('shouldSuggestDowngrade', () => {
  it('is false with no assessments yet', () => {
    expect(shouldSuggestDowngrade([])).toBe(false)
  })

  it('is false with 2 failures out of 2 (not enough data to decide)', () => {
    expect(shouldSuggestDowngrade([false, false])).toBe(false)
  })

  it('is true as soon as 3 of the first 3 fail', () => {
    expect(shouldSuggestDowngrade([false, false, false])).toBe(true)
  })

  it('is true with 3 failures and 1 pass out of the first 4', () => {
    expect(shouldSuggestDowngrade([true, false, false, false])).toBe(true)
  })

  it('is false when only 2 of the first 5 fail', () => {
    expect(shouldSuggestDowngrade([true, true, false, true, false])).toBe(false)
  })

  it('is true with exactly 3 failures out of all 5', () => {
    expect(shouldSuggestDowngrade([true, false, true, false, false])).toBe(true)
  })

  it('throws if given more than 5 flags', () => {
    expect(() => shouldSuggestDowngrade([true, true, true, true, true, true])).toThrow(RangeError)
  })
})

import { checkAndApplyReinforcementReturn } from '@/lib/levels'

function makeReturnChain(users: unknown, progress: unknown) {
  const usersChain: Record<string, unknown> = {}
  usersChain.select = () => usersChain
  usersChain.eq = () => usersChain
  usersChain.single = () => Promise.resolve({ data: users, error: null })
  usersChain.update = () => usersChain
  usersChain.insert = (row: unknown) => { inserted.push(row); return Promise.resolve({ error: null }) }

  const progressChain: Record<string, unknown> = {}
  progressChain.select = () => progressChain
  // user_topic_progress is queried with two chained .eq() calls; the second
  // one is the terminal (thenable) call that resolves with the rows.
  let eqCalls = 0
  progressChain.eq = () => {
    eqCalls += 1
    if (eqCalls >= 2) return Promise.resolve({ data: progress, error: null })
    return progressChain
  }
  progressChain.insert = (row: unknown) => { inserted.push(row); return Promise.resolve({ error: null }) }

  return { usersChain, progressChain }
}

describe('checkAndApplyReinforcementReturn', () => {
  it('returns null when the user is not in reinforcement mode', async () => {
    inserted = []
    const { usersChain } = makeReturnChain({ cefr_level: 'A2', reinforcement_target_level: null }, [])
    const supabase = { from: (table: string) => (table === 'users' ? usersChain : usersChain) } as any
    const result = await checkAndApplyReinforcementReturn(supabase, 'u1')
    expect(result).toBeNull()
  })

  it('returns null when not all reinforcement-level topics are mastered', async () => {
    inserted = []
    const { usersChain, progressChain } = makeReturnChain(
      { cefr_level: 'A1', reinforcement_target_level: 'A2' },
      [{ topic_id: 'introductions', mastery_status: 'mastered' }], // only 1 of 8 A1 topics
    )
    const supabase = { from: (table: string) => (table === 'users' ? usersChain : progressChain) } as any
    const result = await checkAndApplyReinforcementReturn(supabase, 'u1')
    expect(result).toBeNull()
  })

  it('promotes back to the target level once every reinforcement-level topic is mastered', async () => {
    inserted = []
    const a1TopicIds = ['introductions', 'family', 'numbers-dates', 'colors', 'daily-routine', 'food', 'greetings', 'home']
    const { usersChain, progressChain } = makeReturnChain(
      { cefr_level: 'A1', reinforcement_target_level: 'A2' },
      a1TopicIds.map((topic_id) => ({ topic_id, mastery_status: 'mastered' })),
    )
    const supabase = { from: (table: string) => (table === 'users' ? usersChain : progressChain) } as any
    const result = await checkAndApplyReinforcementReturn(supabase, 'u1')
    expect(result).toBe('A2')
    expect(inserted).toEqual([{
      user_id: 'u1', from_level: 'A1', to_level: 'A2', reason: 'reinforcement_auto_return',
    }])
  })
})

import { checkAndApplyLevelPromotion, levelAbove } from '@/lib/levels'

describe('levelAbove', () => {
  it('returns the next level for a mid-range level', () => {
    expect(levelAbove('B1')).toBe('B2')
  })

  it('returns null for C2 (nothing above the ceiling)', () => {
    expect(levelAbove('C2')).toBeNull()
  })

  it('returns the level above A1', () => {
    expect(levelAbove('A1')).toBe('A2')
  })
})

describe('checkAndApplyLevelPromotion', () => {
  it('returns null when the user is in reinforcement mode', async () => {
    inserted = []
    const { usersChain } = makeReturnChain({ cefr_level: 'A1', reinforcement_target_level: 'A2' }, [])
    const supabase = { from: (table: string) => (table === 'users' ? usersChain : usersChain) } as any
    const result = await checkAndApplyLevelPromotion(supabase, 'u1')
    expect(result).toBeNull()
  })

  it('returns null when already at the ceiling level C2', async () => {
    inserted = []
    const { usersChain } = makeReturnChain({ cefr_level: 'C2', reinforcement_target_level: null }, [])
    const supabase = { from: (table: string) => (table === 'users' ? usersChain : usersChain) } as any
    const result = await checkAndApplyLevelPromotion(supabase, 'u1')
    expect(result).toBeNull()
  })

  it('returns null when not all current-level topics are mastered', async () => {
    inserted = []
    const { usersChain, progressChain } = makeReturnChain(
      { cefr_level: 'A1', reinforcement_target_level: null },
      [{ topic_id: 'introductions', mastery_status: 'mastered' }], // only 1 of 8 A1 topics
    )
    const supabase = { from: (table: string) => (table === 'users' ? usersChain : progressChain) } as any
    const result = await checkAndApplyLevelPromotion(supabase, 'u1')
    expect(result).toBeNull()
  })

  it('promotes to the next level once every current-level topic is mastered', async () => {
    inserted = []
    const a1TopicIds = ['introductions', 'family', 'numbers-dates', 'colors', 'daily-routine', 'food', 'greetings', 'home']
    const { usersChain, progressChain } = makeReturnChain(
      { cefr_level: 'A1', reinforcement_target_level: null },
      a1TopicIds.map((topic_id) => ({ topic_id, mastery_status: 'mastered' })),
    )
    const supabase = { from: (table: string) => (table === 'users' ? usersChain : progressChain) } as any
    const result = await checkAndApplyLevelPromotion(supabase, 'u1')
    expect(result).toBe('A2')
    expect(inserted).toEqual([{
      user_id: 'u1', from_level: 'A1', to_level: 'A2', reason: 'auto_promotion',
    }])
  })
})
