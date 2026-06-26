// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

// Mock Supabase server
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      const chain: any = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(), not: vi.fn(), limit: vi.fn() }
      chain.select.mockReturnValue(chain)
      chain.eq.mockReturnValue(chain)
      chain.order.mockReturnValue(chain)
      chain.not.mockReturnValue(chain)
      chain.limit.mockReturnValue(chain)
      if (table === 'sessions') {
        chain.single.mockResolvedValue({
          data: { id: 's1', user_id: 'u1', started_at: '2026-06-26T10:00:00Z', duration_seconds: 300, ended_at: '2026-06-26T10:05:00Z' },
          error: null,
        })
      }
      if (table === 'messages') {
        chain.order.mockResolvedValue({
          data: [
            { id: 'm1', role: 'user', text: 'Hello!', had_correction: false },
            { id: 'm2', role: 'assistant', text: 'Hi there!', had_correction: false },
          ],
          error: null,
        })
      }
      return chain
    }),
  }),
}))

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import ReplayPage from '@/app/dashboard/sessao/[id]/page'

describe('Session replay page', () => {
  it('renders without throwing', async () => {
    const jsx = await ReplayPage({ params: { id: 's1' } })
    expect(jsx).toBeTruthy()
  })
})
