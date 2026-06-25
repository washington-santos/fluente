import { vi, describe, it, expect } from 'vitest'

vi.mock('openai', () => {
  // Create mock audio buffer manually - the string 'fake-audio' in UTF-8
  const mockData = new Uint8Array([102, 97, 107, 101, 45, 97, 117, 100, 105, 111])

  class MockOpenAI {
    audio = {
      speech: {
        create: vi.fn().mockResolvedValue({
          arrayBuffer: async () => mockData.buffer,
        }),
      },
    }
  }

  return { default: MockOpenAI }
})

import { synthesizeTts } from '@/lib/tts'

describe('synthesizeTts', () => {
  it('returns a base64 data URI', async () => {
    const result = await synthesizeTts('Hello world', 'alloy')
    expect(result).toMatch(/^data:audio\/mp3;base64,/)
  })

  it('encodes the audio buffer correctly', async () => {
    const result = await synthesizeTts('Test', 'nova')
    // 'fake-audio' in base64
    const expectedBase64 = Buffer.from('fake-audio').toString('base64')
    expect(result).toBe(`data:audio/mp3;base64,${expectedBase64}`)
  })
})
