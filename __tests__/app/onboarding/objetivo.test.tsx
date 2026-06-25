import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

const fetchMock = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ progress: null }),
})
global.fetch = fetchMock

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'dark' as const, toggle: vi.fn() }),
}))
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => <button>toggle</button> }))

vi.mock('@/hooks/useOnboardingProgress', () => ({
  useOnboardingProgress: vi.fn(() => ({
    progress: null,
    loading: false,
    saveStep: vi.fn(async (step: number, extra?: any) => {
      await fetchMock('/api/onboarding/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, ...extra }),
      })
      pushMock('/cadastro/horario')
    }),
  })),
}))

import ObjetivoPage from '@/app/cadastro/objetivo/page'

describe('ObjetivoPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders 4 goal options', () => {
    render(<ObjetivoPage />)
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(4)
  })

  it('shows error when continuing without selection', async () => {
    render(<ObjetivoPage />)
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    expect(await screen.findByText(/selecione um objetivo/i)).toBeInTheDocument()
  })

  it('calls POST with written_answers on valid selection + continue', async () => {
    render(<ObjetivoPage />)
    fireEvent.click(screen.getByText(/trabalho/i))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/onboarding/progress',
        expect.objectContaining({ method: 'POST' })
      )
    )
  })
})
