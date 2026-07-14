// __tests__/components/dashboard/LevelSuggestionCard.test.tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

import { LevelSuggestionCard } from '@/components/dashboard/LevelSuggestionCard'

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
})

describe('LevelSuggestionCard', () => {
  it('shows the suggestion message with both levels', () => {
    render(<LevelSuggestionCard currentLevel="A2" lowerLevel="A1" />)
    expect(screen.getByText(/A2.*desafiador/i)).toBeInTheDocument()
  })

  it('accepting calls the downgrade endpoint and refreshes', async () => {
    render(<LevelSuggestionCard currentLevel="A2" lowerLevel="A1" />)
    fireEvent.click(screen.getByRole('button', { name: /revisar a1/i }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/level/downgrade', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ reason: 'confirmation_suggestion_accepted' }),
    }))
  })

  it('dismissing calls the dismiss endpoint and hides the card', async () => {
    render(<LevelSuggestionCard currentLevel="A2" lowerLevel="A1" />)
    fireEvent.click(screen.getByRole('button', { name: /continuar no a2/i }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/level/dismiss-suggestion', expect.objectContaining({ method: 'POST' })))
    await waitFor(() => expect(screen.queryByText(/A2.*desafiador/i)).not.toBeInTheDocument())
  })
})
