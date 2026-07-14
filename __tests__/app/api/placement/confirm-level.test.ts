// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }))
const mockInsert = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === 'users') return { update: mockUpdate }
      if (table === 'level_history') return { insert: mockInsert }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { POST } from '@/app/api/placement/confirm-level/route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/placement/confirm-level', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/placement/confirm-level', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ chosen_level: 'A2', recommended_level: 'A2' }))
    expect(res.status).toBe(401)
  })

  it('accepts the recommended level and records placement_recommended', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ chosen_level: 'B1', recommended_level: 'B1' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.level).toBe('B1')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ cefr_level: 'B1' }))
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u1', from_level: null, to_level: 'B1', reason: 'placement_recommended',
    }))
  })

  it('accepts a level below the recommendation and records placement_chose_lower', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ chosen_level: 'A2', recommended_level: 'B1' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.level).toBe('A2')
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ reason: 'placement_chose_lower' }))
  })

  it('rejects a chosen level above the recommendation', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ chosen_level: 'B2', recommended_level: 'B1' }))
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects an invalid CEFR code', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ chosen_level: 'Z9', recommended_level: 'B1' }))
    expect(res.status).toBe(400)
  })
})
