// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }))
const mockInsert = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))
const mockPlacementSingle = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === 'users') return { update: mockUpdate }
      if (table === 'level_history') return { insert: mockInsert }
      if (table === 'placement_results') return {
        select: () => ({ eq: () => ({ maybeSingle: mockPlacementSingle }) }),
      }
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
    const res = await POST(makeRequest({ chosen_level: 'A2' }))
    expect(res.status).toBe(401)
  })

  it('rejects an invalid CEFR code', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ chosen_level: 'Z9' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when there is no placement result on file', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockPlacementSingle.mockResolvedValue({ data: null, error: null })
    const res = await POST(makeRequest({ chosen_level: 'A2' }))
    expect(res.status).toBe(400)
  })

  it('accepts the recommended level and records placement_recommended', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockPlacementSingle.mockResolvedValue({ data: { cefr_level: 'B1' }, error: null })
    const res = await POST(makeRequest({ chosen_level: 'B1' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.level).toBe('B1')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ cefr_level: 'B1' }))
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u1', from_level: null, to_level: 'B1', reason: 'placement_recommended',
    }))
  })

  it('accepts a level below the true recommendation and records placement_chose_lower', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockPlacementSingle.mockResolvedValue({ data: { cefr_level: 'B1' }, error: null })
    const res = await POST(makeRequest({ chosen_level: 'A2' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.level).toBe('A2')
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ reason: 'placement_chose_lower' }))
  })

  it('rejects a chosen level above the true recommendation even if the client lies', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockPlacementSingle.mockResolvedValue({ data: { cefr_level: 'B1' }, error: null })
    const res = await POST(makeRequest({ chosen_level: 'C2' }))
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 500 if the users update fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockPlacementSingle.mockResolvedValue({ data: { cefr_level: 'B1' }, error: null })
    mockUpdate.mockReturnValueOnce({ eq: vi.fn().mockResolvedValue({ error: { message: 'db error' } }) })
    const res = await POST(makeRequest({ chosen_level: 'B1' }))
    expect(res.status).toBe(500)
  })

  it('returns 500 if the level_history insert fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockPlacementSingle.mockResolvedValue({ data: { cefr_level: 'B1' }, error: null })
    mockInsert.mockResolvedValueOnce({ error: { message: 'db error' } })
    const res = await POST(makeRequest({ chosen_level: 'B1' }))
    expect(res.status).toBe(500)
  })
})
