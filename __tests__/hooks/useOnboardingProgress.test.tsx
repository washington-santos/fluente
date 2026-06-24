import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

global.fetch = vi.fn()

function mockFetch(progress: object | null) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ progress }),
  } as Response)
}

import { useOnboardingProgress } from '@/hooks/useOnboardingProgress'

describe('useOnboardingProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads progress on mount', async () => {
    mockFetch({ current_step: 1, completed_at: null })
    const { result } = renderHook(() => useOnboardingProgress(1))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.progress?.current_step).toBe(1)
  })

  it('redirects to /dashboard when completed_at is set', async () => {
    mockFetch({ current_step: 6, completed_at: '2026-01-01T00:00:00Z' })
    renderHook(() => useOnboardingProgress(1))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard'))
  })

  it('forward-redirects when DB step is ahead of page step', async () => {
    mockFetch({ current_step: 3, completed_at: null })
    renderHook(() => useOnboardingProgress(1))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/cadastro/nivelamento'))
  })

  it('does not redirect when DB step matches page step', async () => {
    mockFetch({ current_step: 2, completed_at: null })
    renderHook(() => useOnboardingProgress(2))
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(pushMock).not.toHaveBeenCalled()
  })
})
