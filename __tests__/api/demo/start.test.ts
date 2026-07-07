// @vitest-environment node
import { POST } from '@/app/api/demo/start/route'
import { NextRequest } from 'next/server'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createSupabaseServer: vi.fn() }))

import { createSupabaseServer } from '@/lib/supabase-server'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

function makeSupabase(demoStatus: string | null) {
  const mockUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })
  const mockSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { demo_status: demoStatus }, error: null }),
    }),
  })
  mockFrom.mockReturnValue({ select: mockSelect, update: mockUpdate })
  ;(createSupabaseServer as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })
  return { mockUpdate }
}

describe('POST /api/demo/start', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    makeSupabase(null)
    const res = await POST(new NextRequest('http://localhost/api/demo/start', { method: 'POST' }))
    expect(res.status).toBe(401)
  })

  it('starts demo and returns started:true when no demo started', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const { mockUpdate } = makeSupabase(null)
    const res = await POST(new NextRequest('http://localhost/api/demo/start', { method: 'POST' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.started).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ demo_status: 'active', plan_id: 'demo' })
    )
  })

  it('returns started:false (idempotent) when demo already active', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const { mockUpdate } = makeSupabase('active')
    const res = await POST(new NextRequest('http://localhost/api/demo/start', { method: 'POST' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.started).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
