import { describe, it, expect } from 'vitest'
import { shouldEnterStruggleMode } from '@/lib/adaptive-difficulty'

describe('shouldEnterStruggleMode', () => {
  it('is false with zero events', () => {
    expect(shouldEnterStruggleMode(0)).toBe(false)
  })

  it('is false with one event', () => {
    expect(shouldEnterStruggleMode(1)).toBe(false)
  })

  it('is true with exactly two events', () => {
    expect(shouldEnterStruggleMode(2)).toBe(true)
  })

  it('stays true with more than two events', () => {
    expect(shouldEnterStruggleMode(3)).toBe(true)
  })
})
