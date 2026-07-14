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
