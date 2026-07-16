import { describe, it, expect } from 'vitest'
import { getPronunciationTrend, rankCompetencies } from '@/lib/mastery'

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

describe('rankCompetencies', () => {
  it('returns an empty array when there are no assessments', () => {
    expect(rankCompetencies([])).toEqual([])
  })

  it('ranks a single assessment by its own values, strongest first', () => {
    const result = rankCompetencies([
      { speaking: 90, listening: 50, pronunciation: 70, vocabulary: 60, grammar: 80, confidence: 40, fluency: 30 },
    ])
    expect(result[0]).toEqual({ key: 'speaking', avg: 90 })
    expect(result[result.length - 1]).toEqual({ key: 'fluency', avg: 30 })
    expect(result).toHaveLength(7)
  })

  it('averages multiple assessments per competency and sorts descending', () => {
    const result = rankCompetencies([
      { speaking: 80, listening: 60, pronunciation: 40, vocabulary: 40, grammar: 40, confidence: 40, fluency: 40 },
      { speaking: 60, listening: 60, pronunciation: 40, vocabulary: 40, grammar: 40, confidence: 40, fluency: 40 },
    ])
    // speaking avg = 70, listening avg = 60, the rest are all 40
    expect(result[0]).toEqual({ key: 'speaking', avg: 70 })
    expect(result[1]).toEqual({ key: 'listening', avg: 60 })
    expect(result.slice(2).every(r => r.avg === 40)).toBe(true)
  })

  it('treats a missing competency field on an assessment as 0 for that assessment', () => {
    const result = rankCompetencies([
      { speaking: 100 },
      { speaking: 100, listening: 100 },
    ])
    const speaking = result.find(r => r.key === 'speaking')!
    const listening = result.find(r => r.key === 'listening')!
    expect(speaking.avg).toBe(100)
    expect(listening.avg).toBe(50) // (0 + 100) / 2 — first row's missing listening counts as 0
  })
})
