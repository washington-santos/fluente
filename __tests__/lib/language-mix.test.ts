import { describe, it, expect } from 'vitest'
import { getPortugueseTier } from '@/lib/language-mix'

describe('getPortugueseTier', () => {
  it('returns full for A1 and A2', () => {
    expect(getPortugueseTier('A1')).toBe('full')
    expect(getPortugueseTier('A2')).toBe('full')
  })

  it('returns reduced for B1 and B2', () => {
    expect(getPortugueseTier('B1')).toBe('reduced')
    expect(getPortugueseTier('B2')).toBe('reduced')
  })

  it('returns minimal for C1 and C2', () => {
    expect(getPortugueseTier('C1')).toBe('minimal')
    expect(getPortugueseTier('C2')).toBe('minimal')
  })
})
