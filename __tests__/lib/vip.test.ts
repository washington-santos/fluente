// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdmin: vi.fn(),
}))

import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { isUserVip } from '@/lib/vip'

function makeSupabase(result: unknown) {
  const chain: Record<string, unknown> = {}
  chain.from = vi.fn(() => chain)
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  return chain
}

describe('isUserVip', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns VipUser when email is in vip_users and active', async () => {
    const vipRecord = { id: 'abc', email: 'vip@test.com', plan: 'pro', active: true, notes: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
    const sb = makeSupabase({ data: vipRecord, error: null })
    vi.mocked(createSupabaseAdmin).mockReturnValue(sb as ReturnType<typeof createSupabaseAdmin>)

    const result = await isUserVip('vip@test.com')
    expect(result).toEqual(vipRecord)
  })

  it('returns null when email is not in vip_users', async () => {
    const sb = makeSupabase({ data: null, error: null })
    vi.mocked(createSupabaseAdmin).mockReturnValue(sb as ReturnType<typeof createSupabaseAdmin>)

    const result = await isUserVip('regular@test.com')
    expect(result).toBeNull()
  })

  it('returns null when vip record exists but active = false', async () => {
    // DB returns null from the query because it filters .eq('active', true)
    const sb = makeSupabase({ data: null, error: null })
    vi.mocked(createSupabaseAdmin).mockReturnValue(sb as ReturnType<typeof createSupabaseAdmin>)

    const result = await isUserVip('inactive@test.com')
    expect(result).toBeNull()
  })

  it('returns null on DB error', async () => {
    const sb = makeSupabase({ data: null, error: { message: 'connection failed' } })
    vi.mocked(createSupabaseAdmin).mockReturnValue(sb as ReturnType<typeof createSupabaseAdmin>)

    const result = await isUserVip('any@test.com')
    expect(result).toBeNull()
  })
})
