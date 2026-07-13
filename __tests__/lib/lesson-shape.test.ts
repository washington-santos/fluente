import { describe, it, expect } from 'vitest'
import { getLessonShape } from '@/lib/lesson-shape'

describe('getLessonShape', () => {
  it('gives beginners more vocab support and more exercises per word', () => {
    const a1 = getLessonShape('A1')
    expect(a1.vocabCount).toBe(3)
    expect(a1.translationDefaultVisible).toBe(true)
    expect(a1.exercisesPerWord).toBe(1)
    expect(a1.minExchangesChallenge).toBeGreaterThan(a1.minExchangesPractice)
  })

  it('gives advanced students more vocabulary and less translation support', () => {
    const c2 = getLessonShape('C2')
    expect(c2.vocabCount).toBe(6)
    expect(c2.translationDefaultVisible).toBe(false)
    expect(c2.minExchangesChallenge).toBeGreaterThan(c2.minExchangesPractice)
  })

  it('increases vocab count and exchange requirements monotonically from A1 to C2', () => {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
    const shapes = levels.map(getLessonShape)
    for (let i = 1; i < shapes.length; i++) {
      expect(shapes[i].vocabCount).toBeGreaterThanOrEqual(shapes[i - 1].vocabCount)
      expect(shapes[i].minExchangesPractice).toBeGreaterThanOrEqual(shapes[i - 1].minExchangesPractice)
    }
  })

  it('defaults to A1 shape for an unrecognized level', () => {
    expect(getLessonShape('unknown' as never)).toEqual(getLessonShape('A1'))
  })
})
