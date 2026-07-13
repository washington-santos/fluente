// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockTranscriptionCreate = vi.hoisted(() => vi.fn().mockResolvedValue({ text: 'red' }))
const mockChatCreate = vi.hoisted(() => vi.fn().mockResolvedValue({
  choices: [{ message: { content: '{"assessment":"correct","score":0.9,"feedback_pt":"Muito bom!"}' } }],
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    audio = { transcriptions: { create: mockTranscriptionCreate } }
    chat = { completions: { create: mockChatCreate } }
  },
}))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  }),
}))

import { POST } from '@/app/api/lesson/assess/route'

function makeRequest(fields: Record<string, string | Blob>): Request {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return new Request('http://localhost/api/lesson/assess', { method: 'POST', body: form })
}

describe('POST /api/lesson/assess', () => {
  beforeEach(() => vi.clearAllMocks())

  it('still scores pronunciation attempts', async () => {
    const res = await POST(makeRequest({ type: 'pronunciation', target: 'red', audio: new Blob(['x'], { type: 'audio/webm' }) }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.assessment).toBe('correct')
    expect(body.score).toBe(0.9)
  })

  it('rejects type=conversation — that path moved to /api/conversation', async () => {
    const res = await POST(makeRequest({ type: 'conversation', target: 'red', audio: new Blob(['x'], { type: 'audio/webm' }) }))
    expect(res.status).toBe(400)
  })

  it('rejects an unrecognized type', async () => {
    const res = await POST(makeRequest({ type: 'nonsense', target: 'red' }))
    expect(res.status).toBe(400)
  })
})
