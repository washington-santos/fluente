// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FreePracticeButton } from '@/components/dashboard/FreePracticeButton'

const mockPush = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

const mockFetch = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', mockFetch)

describe('FreePracticeButton', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts a free-practice session and navigates to /aula', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ session_id: 'sess-free-1' }) })
    const user = userEvent.setup()
    render(<FreePracticeButton teacherId="teacher-1" />)
    await user.click(screen.getByText(/Prática livre/))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/aula'))
    expect(mockFetch).toHaveBeenCalledWith('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacher_id: 'teacher-1', mode: 'free' }),
    })
  })

  it('shows an error and stays put when the request fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })
    const user = userEvent.setup()
    render(<FreePracticeButton teacherId="teacher-1" />)
    await user.click(screen.getByText(/Prática livre/))
    await waitFor(() => expect(screen.getByText(/erro/i)).toBeInTheDocument())
    expect(mockPush).not.toHaveBeenCalled()
  })
})
