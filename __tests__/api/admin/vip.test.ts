// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-admin', () => ({ createSupabaseAdmin: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })) }))
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@test.com' } } }) },
  })),
}))

process.env.ADMIN_EMAILS = 'admin@test.com'

import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { GET, POST } from '@/app/api/admin/vip/route'
import { PATCH, DELETE } from '@/app/api/admin/vip/[id]/route'

const mockVipList = [
  {
    id: '1',
    email: 'a@test.com',
    plan: 'pro',
    active: true,
    notes: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
]

function makeOrderResult(listResult = mockVipList) {
  // order() must be thenable (so `await base` works) AND have .ilike() for filtered queries
  const resolved = Promise.resolve({ data: listResult, error: null })
  return Object.assign(resolved, {
    ilike: vi.fn().mockResolvedValue({ data: listResult, error: null }),
  })
}

function makeAdminSb(listResult = mockVipList) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        ilike: vi.fn().mockResolvedValue({ data: listResult, error: null }),
        order: vi.fn(() => makeOrderResult(listResult)),
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: listResult[0] ?? null, error: null }),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: {
              id: '2',
              email: 'new@test.com',
              plan: 'pro',
              active: true,
              notes: null,
              created_at: '2026-01-01',
              updated_at: '2026-01-01',
            },
            error: null,
          }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: { ...mockVipList[0], active: false },
              error: null,
            }),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  }
}

describe('GET /api/admin/vip', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 for non-admin email', async () => {
    const { createSupabaseServer } = await import('@/lib/supabase-server')
    vi.mocked(createSupabaseServer).mockReturnValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { email: 'notadmin@test.com' } },
        }),
      },
    } as ReturnType<typeof createSupabaseServer>)
    const req = new Request('http://localhost/api/admin/vip')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns list of VIP users', async () => {
    vi.mocked(createSupabaseAdmin).mockReturnValue(
      makeAdminSb() as ReturnType<typeof createSupabaseAdmin>,
    )
    const req = new Request('http://localhost/api/admin/vip')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
  })
})

describe('POST /api/admin/vip', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a new VIP user', async () => {
    vi.mocked(createSupabaseAdmin).mockReturnValue(
      makeAdminSb() as ReturnType<typeof createSupabaseAdmin>,
    )
    const req = new Request('http://localhost/api/admin/vip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@test.com', plan: 'pro' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.email).toBe('new@test.com')
  })
})

describe('PATCH /api/admin/vip/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates active status', async () => {
    vi.mocked(createSupabaseAdmin).mockReturnValue(
      makeAdminSb() as ReturnType<typeof createSupabaseAdmin>,
    )
    const req = new Request('http://localhost/api/admin/vip/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false }),
    })
    const res = await PATCH(req, { params: { id: '1' } })
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/admin/vip/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes a VIP user', async () => {
    vi.mocked(createSupabaseAdmin).mockReturnValue(
      makeAdminSb() as ReturnType<typeof createSupabaseAdmin>,
    )
    const req = new Request('http://localhost/api/admin/vip/1', { method: 'DELETE' })
    const res = await DELETE(req, { params: { id: '1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})
