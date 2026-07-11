import { describe, it, expect } from 'vitest'
import { getPronunciationTrend } from '@/lib/mastery'

describe('getPronunciationTrend', () => {
  it('returns null when there are no scores', () => {
    expect(getPronunciationTrend([])).toBeNull()
  })

  it('averages 1-4 scores with no trend', () => {
    const result = getPronunciationTrend([80, 60])
    expect(result).toEqual({ currentScore: 70, trend: null })
  })

  it('averages the 5 most recent scores with no trend when fewer than 10 total', () => {
    // 7 scores total: recent 5 = [90,80,70,60,50] avg 70; previous only has 2 (<5) -> no trend
    const scores = [90, 80, 70, 60, 50, 40, 30]
    const result = getPronunciationTrend(scores)
    expect(result).toEqual({ currentScore: 70, trend: null })
  })

  it('has no trend at exactly 9 total scores (previous period incomplete)', () => {
    const recent = [80, 80, 80, 80, 80] // avg 80
    const previous = [60, 60, 60, 60] // only 4, <5
    const result = getPronunciationTrend([...recent, ...previous])
    expect(result).toEqual({ currentScore: 80, trend: null })
  })

  it('computes an up trend when current average exceeds previous', () => {
    const recent = [90, 90, 90, 90, 90] // avg 90
    const previous = [50, 50, 50, 50, 50] // avg 50
    const result = getPronunciationTrend([...recent, ...previous])
    expect(result).toEqual({ currentScore: 90, trend: 'up' })
  })

  it('computes a down trend when current average is below previous', () => {
    const recent = [50, 50, 50, 50, 50]
    const previous = [90, 90, 90, 90, 90]
    const result = getPronunciationTrend([...recent, ...previous])
    expect(result).toEqual({ currentScore: 50, trend: 'down' })
  })

  it('computes a flat trend when current average equals previous', () => {
    const recent = [70, 70, 70, 70, 70]
    const previous = [70, 70, 70, 70, 70]
    const result = getPronunciationTrend([...recent, ...previous])
    expect(result).toEqual({ currentScore: 70, trend: 'flat' })
  })

  it('only considers the 10 most recent scores for the trend', () => {
    const recent = [100, 100, 100, 100, 100] // avg 100
    const previous = [0, 0, 0, 0, 0] // avg 0
    const older = [100, 100, 100] // must be ignored — beyond the 10 most recent
    const result = getPronunciationTrend([...recent, ...previous, ...older])
    expect(result).toEqual({ currentScore: 100, trend: 'up' })
  })

  it('rounds the current score to the nearest integer', () => {
    const result = getPronunciationTrend([70, 71, 70])
    // avg = 70.333... -> rounds to 70
    expect(result).toEqual({ currentScore: 70, trend: null })
  })
})
