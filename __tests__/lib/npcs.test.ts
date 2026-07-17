import { describe, it, expect } from 'vitest'
import { NPCS, getNpcForTopic, getNpcByKey } from '@/lib/npcs'

describe('NPCS', () => {
  it('has exactly 5 characters', () => {
    expect(NPCS).toHaveLength(5)
  })

  it('maps each NPC to a distinct topic key', () => {
    const topicKeys = NPCS.map(n => n.topicKey)
    expect(new Set(topicKeys).size).toBe(NPCS.length)
  })
})

describe('getNpcForTopic', () => {
  it('returns the correct NPC for each of the 5 mapped topics', () => {
    expect(getNpcForTopic('restaurants')?.name).toBe('Tom')
    expect(getNpcForTopic('travel')?.name).toBe('Sarah')
    expect(getNpcForTopic('job-interview')?.name).toBe('Mike')
    expect(getNpcForTopic('shopping')?.name).toBe('Anna')
    expect(getNpcForTopic('health')?.name).toBe('Dr. Lima')
  })

  it('returns null for a topic with no matching NPC', () => {
    expect(getNpcForTopic('family')).toBeNull()
    expect(getNpcForTopic('introductions')).toBeNull()
  })
})

describe('getNpcByKey', () => {
  it('returns the correct NPC by key', () => {
    expect(getNpcByKey('tom')?.topicKey).toBe('restaurants')
  })

  it('returns null for an unknown key', () => {
    expect(getNpcByKey('nonexistent')).toBeNull()
  })
})
