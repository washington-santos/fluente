import { describe, it, expect } from 'vitest'
import { pickTopic, getTopicByKey } from '@/lib/topics'

describe('pickTopic', () => {
  it('returns a topic for A1 level', () => {
    const t = pickTopic('A1', 0)
    expect(t).not.toBeNull()
    expect(t?.key).toBe('introductions')
  })

  it('cycles through topics by completedCount', () => {
    const t0 = pickTopic('A1', 0)
    const t8 = pickTopic('A1', 8)
    expect(t0?.key).toBe(t8?.key)
  })

  it('falls back to A1 when level is null', () => {
    expect(pickTopic(null, 0)).not.toBeNull()
  })

  it('returns different topics for different levels', () => {
    const a1 = pickTopic('A1', 0)
    const b1 = pickTopic('B1', 0)
    expect(a1?.key).not.toBe(b1?.key)
  })
})

describe('getTopicByKey', () => {
  it('returns topic for a known key', () => {
    const t = getTopicByKey('travel')
    expect(t?.labelPt).toBe('Viagens')
  })

  it('returns null for unknown key', () => {
    expect(getTopicByKey('not-a-key')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(getTopicByKey(null)).toBeNull()
  })
})

describe('pickTopic for C1/C2', () => {
  it('pickTopic returns a C1 topic', () => {
    const topic = pickTopic('C1', 0)
    expect(topic?.key).toBe('job-interview')
  })

  it('pickTopic returns a C2 topic', () => {
    const topic = pickTopic('C2', 0)
    expect(topic?.key).toBe('native-humor')
  })
})

import { getTopicsForLevel } from '@/lib/topics'

describe('grammarFocus', () => {
  it('every topic across every level has a non-empty grammarFocus', () => {
    for (const level of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const) {
      const topics = getTopicsForLevel(level)
      expect(topics.length).toBeGreaterThan(0)
      for (const t of topics) {
        expect(t.grammarFocus).toBeTruthy()
      }
    }
  })

  it('returns the expected grammarFocus for a known topic', () => {
    const t = getTopicByKey('family')
    expect(t?.grammarFocus).toBe('Possessive adjectives: my, his, her')
  })
})
