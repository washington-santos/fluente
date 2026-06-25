import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('createTalk', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
  })

  it('returns null when DID_API_KEY is not set', async () => {
    delete process.env.DID_API_KEY
    const { createTalk } = await import('@/lib/did')
    const result = await createTalk('Hello', 'en-US-JennyNeural', 'https://example.com/avatar.png')
    expect(result).toBeNull()
  })

  it('returns the result_url when D-ID responds with done status', async () => {
    process.env.DID_API_KEY = 'test-key'
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'tlk_123' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'done', result_url: 'https://d-id.com/video.mp4' }),
      } as Response)

    const { createTalk } = await import('@/lib/did')
    const result = await createTalk('Hello', 'en-US-JennyNeural', 'https://example.com/avatar.png')
    expect(result).toBe('https://d-id.com/video.mp4')
  })

  it('returns null when D-ID create request fails', async () => {
    process.env.DID_API_KEY = 'test-key'
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response)
    const { createTalk } = await import('@/lib/did')
    const result = await createTalk('Hello', 'en-US-JennyNeural', 'https://example.com/avatar.png')
    expect(result).toBeNull()
  })
})
