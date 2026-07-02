import { describe, it, expect } from 'vitest'
import { getMissionForDate } from '@/lib/missions'

describe('getMissionForDate', () => {
  it('returns a mission for A1 level', () => {
    const m = getMissionForDate('A1', '2026-07-01')
    expect(m).toBeDefined()
    expect(m.key).toMatch(/^a1-/)
  })

  it('cycles through missions — day 1 and day 4 return the same mission', () => {
    const m1 = getMissionForDate('A1', '2026-07-01')  // day 1 → index 0
    const m4 = getMissionForDate('A1', '2026-07-04')  // day 4 → index 0
    expect(m1.key).toBe(m4.key)
  })

  it('day 2 and day 1 return different missions', () => {
    const m1 = getMissionForDate('A1', '2026-07-01')
    const m2 = getMissionForDate('A1', '2026-07-02')
    expect(m1.key).not.toBe(m2.key)
  })

  it('falls back to A1 when level is null', () => {
    expect(() => getMissionForDate(null, '2026-07-01')).not.toThrow()
  })

  it('B1 missions differ from A1 missions', () => {
    const a1 = getMissionForDate('A1', '2026-07-01')
    const b1 = getMissionForDate('B1', '2026-07-01')
    expect(a1.key).not.toBe(b1.key)
  })

  it('getMissionForDate returns a C1 mission', () => {
    const m = getMissionForDate('C1', '2026-07-01')
    expect(m.key).toBe('c1-interview')
  })

  it('getMissionForDate returns a C2 mission', () => {
    const m = getMissionForDate('C2', '2026-07-02')
    expect(m.key).toBe('c2-debate')
  })
})
