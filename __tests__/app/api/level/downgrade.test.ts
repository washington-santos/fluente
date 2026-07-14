// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({ auth: { getUser: mockGetUser }, from: mockFrom }),
}))

import { POST } from '@/app/api/level/downgrade/route'

function makeChain(data: unknown) {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.single = () => Promise.resolve({ data, error: null })
  chain.update = () => chain
  chain.insert = vi.fn().mockResolvedValue({ error: null })
  return chain
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/level/downgrade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/level/downgrade', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ reason: 'manual_downgrade' }))
    expect(res.status).toBe(401)
  })

  it('rejects an invalid reason', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ reason: 'placement_recommended' }))
    expect(res.status).toBe(400)
  })

  it('downgrades the user and returns the new level', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const usersChain = makeChain({ cefr_level: 'A2', reinforcement_target_level: null })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return usersChain
      if (table === 'level_history') return makeChain(null)
      throw new Error(`unexpected table ${table}`)
    })
    const res = await POST(makeRequest({ reason: 'manual_downgrade' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toEqual({ level: 'A1', reinforcement_target_level: 'A2' })
  })

  it('returns 400 when already at the floor level A1', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const usersChain = makeChain({ cefr_level: 'A1', reinforcement_target_level: null })
    mockFrom.mockImplementation((table: string) => (table === 'users' ? usersChain : makeChain(null)))
    const res = await POST(makeRequest({ reason: 'manual_downgrade' }))
    expect(res.status).toBe(400)
  })
})
