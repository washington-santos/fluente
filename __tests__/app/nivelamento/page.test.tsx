// @vitest-environment jsdom
import { vi, describe, it, expect } from 'vitest'

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'u1', teacher_id: 't1', cefr_level: null,
          written_answers: ['viagem'],
        }
      }),
    }),
  }),
}))
vi.mock('@/app/nivelamento/PlacementTestEngine', () => ({
  PlacementTestEngine: () => <div>PlacementTestEngine</div>,
}))

import NivelamentoPage from '@/app/nivelamento/page'

describe('NivelamentoPage', () => {
  it('renders without crashing', async () => {
    const { redirect } = await import('next/navigation')
    vi.mocked(redirect).mockImplementation(() => { throw new Error('redirect') })
    try {
      const Page = await NivelamentoPage()
      expect(Page).toBeTruthy()
    } catch (e) {
      expect((e as Error).message).toBe('redirect')
    }
  })
})
