// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Set up mocks BEFORE any other imports
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush })
}))

// Import after mocks
import { MissionCard } from '@/components/dashboard/MissionCard'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch as any

describe('MissionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the mission title and description once loaded, not completed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ mission: { missionKey: 'b1-movie', titlePt: 'Recomendação cultural', descriptionPt: 'Recomende um filme.', minUserTurns: 5, completed: false } }),
    })
    render(<MissionCard />)
    await waitFor(() => expect(screen.getByText('Recomendação cultural')).toBeInTheDocument())
    expect(screen.getByText('Recomende um filme.')).toBeInTheDocument()
    expect(screen.queryByText(/missão concluída/i)).not.toBeInTheDocument()
  })

  it('shows a start button when not completed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ mission: { missionKey: 'b1-movie', titlePt: 'Recomendação cultural', descriptionPt: 'Recomende um filme.', minUserTurns: 5, completed: false } }),
    })
    render(<MissionCard />)
    await waitFor(() => expect(screen.getByRole('button')).toBeInTheDocument())
  })

  it('shows completed styling and no start button when completed', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ mission: { missionKey: 'b1-movie', titlePt: 'Recomendação cultural', descriptionPt: 'Recomende um filme.', minUserTurns: 5, completed: true } }),
    })
    render(<MissionCard />)
    await waitFor(() => expect(screen.getByText(/missão concluída/i)).toBeInTheDocument())
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('starts a mission-focused lesson and navigates to /aula on button click', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ mission: { missionKey: 'b1-movie', titlePt: 'Recomendação cultural', descriptionPt: 'Recomende um filme.', minUserTurns: 5, completed: false } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session_id: 'session-99' }),
      })
    const user = userEvent.setup()
    render(<MissionCard />)
    const button = await screen.findByRole('button')
    await user.click(button)
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/aula'))
    expect(mockFetch).toHaveBeenCalledWith('/api/mission/start', { method: 'POST' })
  })
})
