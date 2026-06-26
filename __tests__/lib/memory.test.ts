// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockCreate }
  }
  return { default: MockAnthropic }
})

import { generateSessionMemory } from '@/lib/memory'

const messages = [
  { role: 'user', text: 'I work as a software engineer in São Paulo.' },
  { role: 'assistant', text: 'That\'s great! How long have you been working there?' },
  { role: 'user', text: 'For three years now. I love coding.' },
]

describe('generateSessionMemory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls Claude Haiku and returns parsed MemoryOutput', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"summary":"Student is a software engineer in São Paulo.","key_topics":["job vocabulary","present perfect"],"personal_details":["software engineer","lives in São Paulo","3 years experience"]}' }],
    })
    const result = await generateSessionMemory(messages, 'Ana', 'B1')
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
    }))
    expect(result.summary).toBe('Student is a software engineer in São Paulo.')
    expect(result.key_topics).toEqual(['job vocabulary', 'present perfect'])
    expect(result.personal_details).toContain('software engineer')
  })

  it('returns safe fallback when Claude returns malformed JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
    })
    const result = await generateSessionMemory(messages, 'Ana', 'B1')
    expect(result.summary).toContain('Session')
    expect(Array.isArray(result.key_topics)).toBe(true)
    expect(Array.isArray(result.personal_details)).toBe(true)
  })
})
