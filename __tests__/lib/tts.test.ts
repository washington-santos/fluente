import { vi, describe, it, expect } from 'vitest'

vi.mock('openai', () => {
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
  it('returns a dataUrl and a buffer', async () => {
    const result = await synthesizeTts('Hello world', 'alloy')
    expect(result).toHaveProperty('dataUrl')
    expect(result).toHaveProperty('buffer')
    expect(result.dataUrl).toMatch(/^data:audio\/mp3;base64,/)
    expect(result.buffer).toBeInstanceOf(Buffer)
  })

  it('encodes the audio buffer correctly in dataUrl', async () => {
    const result = await synthesizeTts('Test', 'nova')
    const expectedBase64 = Buffer.from('fake-audio').toString('base64')
    expect(result.dataUrl).toBe(`data:audio/mp3;base64,${expectedBase64}`)
  })

  it('returns the raw buffer bytes', async () => {
    const result = await synthesizeTts('Test', 'nova')
    expect(result.buffer.toString()).toBe('fake-audio')
  })
})
