// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createSupabaseServer: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('./AulaClient', () => ({ AulaClient: () => null }))

import AulaPage from '@/app/aula/page'
import { createSupabaseServer } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

function setupSupabase(opts: {
  sub?: { id: string } | null
  userData?: {
    id: string
    teacher_id: string
    cefr_level: string
    demo_status: string | null
    demo_expires_at: string | null
  }
}) {
  const fromImpl = (table: string) => {
    if (table === 'users') {
      return {
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: opts.userData,
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'subscriptions') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: opts.sub ?? null,
                error: null,
              }),
            }),
          }),
        }),
      }
    }
    if (table === 'teachers') {
      return {
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: { id: opts.userData?.teacher_id, name: 'Test Teacher' },
              error: null,
            }),
          }),
        }),
      }
    }
    // Fallback for other tables
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
  }

  mockFrom.mockImplementation(fromImpl)
  ;(createSupabaseServer as ReturnType<typeof vi.fn>).mockReturnValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })
}

describe('Aula Page Demo Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to /planos?demo_ended=1 when no demo_status (demo required)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
    })

    setupSupabase({
      sub: null,
      userData: {
        id: 'user-1',
        teacher_id: 'teacher-1',
        cefr_level: 'B1',
        demo_status: null,
        demo_expires_at: null,
      },
    })

    try {
      await AulaPage()
    } catch (e) {
      // redirect() throws in server components
    }

    expect(redirect).toHaveBeenCalledWith('/planos?demo_ended=1')
  })

  it('redirects to /planos?demo_ended=1 when demo_status is expired', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-2' } },
    })

    setupSupabase({
      sub: null,
      userData: {
        id: 'user-2',
        teacher_id: 'teacher-2',
        cefr_level: 'B2',
        demo_status: 'expired',
        demo_expires_at: new Date(Date.now() - 1000).toISOString(),
      },
    })

    try {
      await AulaPage()
    } catch (e) {
      // redirect() throws in server components
    }

    expect(redirect).toHaveBeenCalledWith('/planos?demo_ended=1')
  })

  it('does NOT redirect when demo_status is active and not time-expired', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-3' } },
    })

    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    setupSupabase({
      sub: null,
      userData: {
        id: 'user-3',
        teacher_id: 'teacher-3',
        cefr_level: 'A1',
        demo_status: 'active',
        demo_expires_at: futureDate,
      },
    })

    try {
      await AulaPage()
    } catch (e) {
      // May throw for other reasons (AulaClient mock), but should not redirect
    }

    // Check that redirect was not called with the demo_ended path
    const redirectCalls = vi.mocked(redirect).mock.calls
    const demoEndedRedirects = redirectCalls.filter(
      (call) => call[0] === '/planos?demo_ended=1'
    )
    expect(demoEndedRedirects).toHaveLength(0)
  })
})
