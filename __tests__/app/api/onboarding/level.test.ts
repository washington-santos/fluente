// @vitest-environment node
import { vi, describe, it, expect } from 'vitest'

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      audio: {
        transcriptions: {
          create: vi.fn().mockResolvedValue({ text: 'Hello, I work as a software engineer.' }),
        },
      },
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'B1' } }],
          }),
        },
      },
    }
  }),
}))

import { POST } from '@/app/api/onboarding/level/route'

function makeFormRequest(mimeType = 'audio/webm') {
  const blob = new Blob(['fake-audio'], { type: mimeType })
  const form = new FormData()
  form.append('audio', blob, 'recording.webm')
  return new Request('http://localhost/api/onboarding/level', {
    method: 'POST',
    body: form,
  })
}

describe('POST /api/onboarding/level', () => {
  it('returns level and transcript', async () => {
    const res = await POST(makeFormRequest())
    const body = await res.json()
    expect(body.level).toBe('B1')
    expect(body.transcript).toBe('Hello, I work as a software engineer.')
  })

  it('returns 401 when unauthenticated', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)
    const res = await POST(makeFormRequest())
    expect(res.status).toBe(401)
  })
})
