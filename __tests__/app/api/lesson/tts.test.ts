// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockSynthesizeTts = vi.hoisted(() => vi.fn().mockResolvedValue({ dataUrl: 'data:audio/mp3;base64,AAAA', buffer: Buffer.from('x') }))

vi.mock('@/lib/tts', () => ({ synthesizeTts: mockSynthesizeTts }))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

import { POST } from '@/app/api/lesson/tts/route'

function makeRequest(fields: Record<string, string>): Request {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return new Request('http://localhost/api/lesson/tts', { method: 'POST', body: form })
}

describe('POST /api/lesson/tts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('defaults to speed 1.0 when no speed field is sent', async () => {
    const res = await POST(makeRequest({ text: 'Hello', voice: 'alloy' }))
    expect(res.status).toBe(200)
    expect(mockSynthesizeTts).toHaveBeenCalledWith('Hello', 'alloy', 1.0)
  })

  it('passes a custom speed through', async () => {
    const res = await POST(makeRequest({ text: 'Hello', voice: 'alloy', speed: '0.85' }))
    expect(res.status).toBe(200)
    expect(mockSynthesizeTts).toHaveBeenCalledWith('Hello', 'alloy', 0.85)
  })

  it('clamps an out-of-range speed to the valid OpenAI bounds', async () => {
    await POST(makeRequest({ text: 'Hello', voice: 'alloy', speed: '10' }))
    expect(mockSynthesizeTts).toHaveBeenCalledWith('Hello', 'alloy', 4.0)

    await POST(makeRequest({ text: 'Hello', voice: 'alloy', speed: '0.01' }))
    expect(mockSynthesizeTts).toHaveBeenCalledWith('Hello', 'alloy', 0.25)
  })
})
