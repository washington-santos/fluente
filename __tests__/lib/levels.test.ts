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
