import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('createDidTalk', () => {
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
    const { createDidTalk } = await import('@/lib/did')
    const result = await createDidTalk('Hello', 'en-US-JennyNeural', 'https://example.com/avatar.png')
    expect(result).toBeNull()
  })

  it('returns the talk id when D-ID accepts the create request', async () => {
    process.env.DID_API_KEY = 'test-key'
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'tlk_123' }) } as Response)

    const { createDidTalk } = await import('@/lib/did')
    const result = await createDidTalk('Hello', 'en-US-JennyNeural', 'https://example.com/avatar.png')
    expect(result).toBe('tlk_123')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('returns null when D-ID create request fails', async () => {
    process.env.DID_API_KEY = 'test-key'
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response)
    const { createDidTalk } = await import('@/lib/did')
    const result = await createDidTalk('Hello', 'en-US-JennyNeural', 'https://example.com/avatar.png')
    expect(result).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    process.env.DID_API_KEY = 'test-key'
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'))
    const { createDidTalk } = await import('@/lib/did')
    const result = await createDidTalk('Hello', 'en-US-JennyNeural', 'https://example.com/avatar.png')
    expect(result).toBeNull()
  })
})

describe('pollDidTalk', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, DID_API_KEY: 'test-key' }
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
  })

  it('returns done + resultUrl when D-ID reports done', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'done', result_url: 'https://d-id.com/video.mp4' }),
    } as Response)
    const { pollDidTalk } = await import('@/lib/did')
    expect(await pollDidTalk('tlk_123')).toEqual({ status: 'done', resultUrl: 'https://d-id.com/video.mp4' })
  })

  it('returns pending while D-ID is still processing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'started' }) } as Response)
    const { pollDidTalk } = await import('@/lib/did')
    expect(await pollDidTalk('tlk_123')).toEqual({ status: 'pending', resultUrl: null })
  })

  it('returns error when D-ID reports an error status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'error' }) } as Response)
    const { pollDidTalk } = await import('@/lib/did')
    expect(await pollDidTalk('tlk_123')).toEqual({ status: 'error', resultUrl: null })
  })

  it('returns error when the HTTP request fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response)
    const { pollDidTalk } = await import('@/lib/did')
    expect(await pollDidTalk('tlk_123')).toEqual({ status: 'error', resultUrl: null })
  })
})
