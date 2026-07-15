import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockCreate = vi.fn()

vi.mock('openai', () => {
  class MockOpenAI {
    audio = { speech: { create: mockCreate } }
  }
  return { default: MockOpenAI }
})

import { synthesizeTts, synthesizeTtsWithRetry } from '@/lib/tts'

function fakeAudioResponse() {
  return { arrayBuffer: async () => new Uint8Array([102, 97, 107, 101, 45, 97, 117, 100, 105, 111]).buffer }
}

beforeEach(() => {
  mockCreate.mockReset()
  mockCreate.mockResolvedValue(fakeAudioResponse())
})

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

  it('defaults to speed 1.0 when not specified', async () => {
    await synthesizeTts('Hello', 'alloy')
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ speed: 1.0 }))
  })

  it('passes a custom speed through to the OpenAI call', async () => {
    await synthesizeTts('Hello', 'alloy', 0.85)
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ speed: 0.85 }))
  })
})

describe('synthesizeTtsWithRetry', () => {
  it('returns immediately on first success without retrying', async () => {
    const result = await synthesizeTtsWithRetry('Hello', 'alloy')
    expect(result.dataUrl).toMatch(/^data:audio\/mp3;base64,/)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('retries after a transient failure and succeeds', async () => {
    mockCreate.mockRejectedValueOnce(new Error('rate limited'))
    mockCreate.mockResolvedValueOnce(fakeAudioResponse())

    const result = await synthesizeTtsWithRetry('Hello', 'alloy', 3)
    expect(result.dataUrl).toMatch(/^data:audio\/mp3;base64,/)
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('throws the last error after exhausting all attempts', async () => {
    mockCreate.mockRejectedValue(new Error('persistent failure'))
    await expect(synthesizeTtsWithRetry('Hello', 'alloy', 2)).rejects.toThrow('persistent failure')
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })
})
