// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock isUserVip
vi.mock('@/lib/vip', () => ({
  isUserVip: vi.fn(),
}))

// Re-use the existing conversation mock pattern
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: vi.fn(),
}))
vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdmin: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}))
vi.mock('openai', () => ({
  default: class {
    audio = { transcriptions: { create: vi.fn().mockResolvedValue({ text: 'hello' }) } }
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify({ reply: 'Hi!', correction: { error_detected: false, error_text: null, correct_form: null, error_type: null }, pronunciation_hint: null, new_words: null, suggested_replies: null, reply_pt: null, prompt_hint: null }) } }],
          usage: { prompt_tokens: 10, completion_tokens: 10 },
        }),
      },
    }
  },
}))
vi.mock('@/lib/tts', () => ({ synthesizeTts: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/did', () => ({ createTalk: vi.fn().mockResolvedValue(null), DID_VOICE_IDS: {} }))
vi.mock('@/lib/topics', () => ({ getTopicByKey: vi.fn().mockReturnValue(null) }))

import { isUserVip } from '@/lib/vip'
import { createSupabaseServer } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { POST } from '@/app/api/conversation/route'

const mockVipUser = { id: 'v1', email: 'vip@test.com', plan: 'pro', active: true, notes: null, created_at: '2026-01-01', updated_at: '2026-01-01' }

function makeSupabase(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {}
  const chainFn = () => chain
  chain.from = vi.fn((table: string) => {
    if (table === 'sessions') return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    }
    if (table === 'users') return {
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 'u1', demo_status: null, demo_started_at: null, demo_expires_at: null }, error: null }) })) })),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    }
    if (table === 'subscriptions') return {
      select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })),
    }
    return {
      select: vi.fn(chainFn), eq: vi.fn(chainFn), gte: vi.fn(chainFn),
      insert: vi.fn().mockResolvedValue({ error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn(chainFn),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      limit: vi.fn(chainFn), order: vi.fn(chainFn), is: vi.fn(chainFn),
      ...overrides,
    }
  })
  chain.auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'vip@test.com' } } }) }
  return chain
}

describe('VIP bypass in conversation route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows VIP user even with no demo and no subscription', async () => {
    vi.mocked(isUserVip).mockResolvedValue(mockVipUser)
    const sb = makeSupabase()
    vi.mocked(createSupabaseServer).mockReturnValue(sb as ReturnType<typeof createSupabaseServer>)
    vi.mocked(createSupabaseAdmin).mockReturnValue(sb as ReturnType<typeof createSupabaseAdmin>)

    const formData = new FormData()
    formData.append('panic_text', 'hello')
    formData.append('session_id', 's1')

    const req = new Request('http://localhost/api/conversation', { method: 'POST', body: formData })
    const res = await POST(req)
    // Should NOT return 403 demo_required or 429 quota_exceeded
    expect(res.status).not.toBe(403)
    expect(res.status).not.toBe(429)
  })
})
