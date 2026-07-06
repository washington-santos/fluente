// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
  })),
}))

// Use class-based mock so `new OpenAI()` works correctly in vitest v4
vi.mock('openai', () => ({
  default: class MockOpenAI {
    audio = {
      transcriptions: { create: vi.fn().mockResolvedValue({ text: 'hospital' }) },
    }
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: '{"score":0.9,"feedback_pt":"Muito bem!"}' } }],
        }),
      },
    }
  },
}))

import { POST } from '@/app/api/placement/assess/route'

describe('POST /api/placement/assess', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns score and transcript for a vocabulary question', async () => {
    const fd = new FormData()
    fd.append('audio', new Blob(['audio'], { type: 'audio/webm' }), 'rec.webm')
    fd.append('question_id', 'v1')
    fd.append('phase', 'vocabulary')
    fd.append('expected_topic', 'hospital')
    fd.append('prompt_tts', 'What is this? 🏥 Say the word.')
    const req = new Request('http://localhost/api/placement/assess', { method: 'POST', body: fd })
    const res = await POST(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.score).toBeGreaterThanOrEqual(0)
    expect(json.score).toBeLessThanOrEqual(1)
    expect(typeof json.transcript).toBe('string')
    expect(typeof json.feedback_pt).toBe('string')
  })

  it('returns 401 when unauthenticated', async () => {
    const { createSupabaseServer } = await import('@/lib/supabase-server')
    vi.mocked(createSupabaseServer).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never)
    const fd = new FormData()
    fd.append('audio', new Blob(['x']))
    const req = new Request('http://localhost/api/placement/assess', { method: 'POST', body: fd })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
