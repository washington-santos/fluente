// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createSupabaseServer: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ createSupabaseAdmin: vi.fn() }))
vi.mock('@/lib/vip', () => ({ isUserVip: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/tts', () => ({ synthesizeTts: vi.fn() }))
vi.mock('@/lib/did', () => ({ createTalk: vi.fn(), DID_VOICE_IDS: {} }))
vi.mock('@/lib/topics', () => ({ getTopicByKey: vi.fn().mockReturnValue({ key: 'daily', label: 'Daily' }) }))
vi.mock('openai', () => ({
  default: class { chat = { completions: { create: vi.fn() } } },
}))

import { POST } from '@/app/api/conversation/route'
import { NextRequest } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

function setupSupabase(opts: {
  sub?: { plans: { minutes_per_month: number } } | null
  demoUser?: { demo_status: string | null; demo_started_at: string | null; demo_expires_at: string | null }
  usageMinutes?: number
}) {
  const fromImpl = (table: string) => {
    if (table === 'subscriptions') {
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: opts.sub ?? null, error: null }) }) }),
        }),
      }
    }
    if (table === 'users') {
      const demoUser = opts.demoUser ?? { demo_status: null, demo_started_at: null, demo_expires_at: null }
      return {
        select: () => ({
          eq: () => ({ single: vi.fn().mockResolvedValue({ data: demoUser, error: null }) }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }
    }
    if (table === 'usage_log') {
      const min = opts.usageMinutes ?? 0
      return {
        select: () => ({
          eq: () => ({
            gte: vi.fn().mockResolvedValue({ data: [{ whisper_minutes: min }], error: null }),
          }),
        }),
        insert: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [] }) }),
      }
    }
    // Chainable fallback for tables like 'sessions', 'messages', etc.
    const chain: Record<string, ReturnType<typeof vi.fn>> = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [] }) }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      order: vi.fn(),
      limit: vi.fn(),
      is: vi.fn(),
      gte: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    chain.select.mockReturnValue(chain)
    chain.eq.mockReturnValue(chain)
    chain.order.mockReturnValue(chain)
    chain.limit.mockReturnValue(chain)
    chain.is.mockReturnValue(chain)
    return chain
  }
  mockFrom.mockImplementation(fromImpl)
  ;(createSupabaseServer as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })
}

function makeRequest() {
  const fd = new FormData()
  fd.append('session_id', 'sess-1')
  fd.append('panic_text', 'hello')
  return new NextRequest('http://localhost/api/conversation', { method: 'POST', body: fd })
}

describe('conversation quota — demo path', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 demo_required when no sub and no demo started', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    setupSupabase({ sub: null, demoUser: { demo_status: null, demo_started_at: null, demo_expires_at: null } })
    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('demo_required')
  })

  it('returns 429 demo_expired when demo_status is expired', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    setupSupabase({
      sub: null,
      demoUser: { demo_status: 'expired', demo_started_at: '2026-07-01T00:00:00Z', demo_expires_at: '2026-07-08T00:00:00Z' },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('demo_expired')
  })

  it('returns 429 demo_exhausted when demo_status is already exhausted in DB', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    setupSupabase({
      sub: null,
      demoUser: { demo_status: 'exhausted', demo_started_at: '2026-07-01T00:00:00Z', demo_expires_at: '2099-07-08T00:00:00Z' },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('demo_exhausted')
  })

  it('returns 429 demo_exhausted when demo minutes used >= 30', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    setupSupabase({
      sub: null,
      demoUser: { demo_status: 'active', demo_started_at: '2026-07-01T00:00:00Z', demo_expires_at: '2099-07-08T00:00:00Z' },
      usageMinutes: 31,
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('demo_exhausted')
  })

  it('passes quota check when demo active and minutes remaining', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    setupSupabase({
      sub: null,
      demoUser: { demo_status: 'active', demo_started_at: '2026-07-01T00:00:00Z', demo_expires_at: '2099-07-08T00:00:00Z' },
      usageMinutes: 5,
    })
    const res = await POST(makeRequest())
    // Passes quota — may fail downstream for unrelated reasons (missing session etc)
    expect(res.status).not.toBe(403)
    expect(res.status).not.toBe(429)
  })
})
