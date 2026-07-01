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
