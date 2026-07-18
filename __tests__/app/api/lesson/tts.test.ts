// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockSpeechCreate = vi.hoisted(() => vi.fn())
const mockUpload = vi.hoisted(() => vi.fn())
const mockGetPublicUrl = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({ auth: { getUser: mockGetUser } }),
}))

vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  }),
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    audio = {
      speech: { create: mockSpeechCreate },
    }
  },
}))

import { POST } from '@/app/api/lesson/tts/route'

function makeFormRequest(fields: Record<string, string>) {
  const form = new FormData()
  Object.entries(fields).forEach(([k, v]) => form.append(k, v))
  return new Request('http://localhost/api/lesson/tts', { method: 'POST', body: form })
}

describe('POST /api/lesson/tts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSpeechCreate.mockResolvedValue({
      arrayBuffer: async () => new TextEncoder().encode('fake-mp3-bytes').buffer,
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeFormRequest({ text: 'Hello' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when text is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const res = await POST(makeFormRequest({}))
    expect(res.status).toBe(400)
  })

  it('uploads the synthesized audio to storage and returns the public URL', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockUpload.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://storage.example.com/audio-replay/user-1/abc.mp3' },
    })

    const res = await POST(makeFormRequest({ text: 'Hello there', voice: 'alloy' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.audio_url).toBe('https://storage.example.com/audio-replay/user-1/abc.mp3')
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\//),
      expect.any(Buffer),
      { contentType: 'audio/mpeg', upsert: false },
    )
  })

  it('falls back to the inline data URL when the storage upload fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockUpload.mockResolvedValue({ error: { message: 'bucket unreachable' } })

    const res = await POST(makeFormRequest({ text: 'Hello there' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.audio_url).toMatch(/^data:audio\/mp3;base64,/)
  })

  it('defaults to speed 1.0 when no speed field is sent', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockUpload.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://storage.example.com/audio-replay/user-1/abc.mp3' } })

    const res = await POST(makeFormRequest({ text: 'Hello', voice: 'alloy' }))

    expect(res.status).toBe(200)
    expect(mockSpeechCreate.mock.calls[0][0].speed).toBe(1.0)
  })

  it('passes a custom speed through', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockUpload.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://storage.example.com/audio-replay/user-1/abc.mp3' } })

    const res = await POST(makeFormRequest({ text: 'Hello', voice: 'alloy', speed: '0.85' }))

    expect(res.status).toBe(200)
    expect(mockSpeechCreate.mock.calls[0][0].speed).toBe(0.85)
  })

  it('clamps an out-of-range speed to the valid OpenAI bounds', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockUpload.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://storage.example.com/audio-replay/user-1/abc.mp3' } })

    await POST(makeFormRequest({ text: 'Hello', voice: 'alloy', speed: '10' }))
    expect(mockSpeechCreate.mock.calls[0][0].speed).toBe(4.0)

    await POST(makeFormRequest({ text: 'Hello', voice: 'alloy', speed: '0.01' }))
    expect(mockSpeechCreate.mock.calls[1][0].speed).toBe(0.25)
  })

  it('falls back to speed 1.0 when the speed field is not a valid number', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockUpload.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://storage.example.com/audio-replay/user-1/abc.mp3' } })

    const res = await POST(makeFormRequest({ text: 'Hello', voice: 'alloy', speed: 'not-a-number' }))

    expect(res.status).toBe(200)
    expect(mockSpeechCreate.mock.calls[0][0].speed).toBe(1.0)
  })
})
