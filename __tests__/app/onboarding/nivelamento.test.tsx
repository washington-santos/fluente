import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    progress: { current_step: 3, written_answers: ['trabalho', '20min'], completed_at: null },
  }),
})
vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => ({ theme: 'dark' as const, toggle: vi.fn() }) }))
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => <button>toggle</button> }))
vi.mock('@/hooks/useOnboardingProgress', () => ({
  useOnboardingProgress: () => ({
    progress: { current_step: 3, written_answers: ['trabalho', '20min'], completed_at: null },
    loading: false,
    saveStep: async (step: number, extra?: Record<string, unknown>) => {
      await fetch('/api/onboarding/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, ...extra }),
      })
      pushMock('/cadastro/conversa')
    },
  }),
}))

import NivelamentoPage from '@/app/cadastro/nivelamento/page'

describe('NivelamentoPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the first MCQ question', async () => {
    render(<NivelamentoPage />)
    await waitFor(() =>
      expect(screen.getByText(/_____ is your name/i)).toBeInTheDocument()
    )
  })

  it('advances to next question when an option is selected', async () => {
    render(<NivelamentoPage />)
    await waitFor(() => screen.getByText(/_____ is your name/i))
    fireEvent.click(screen.getByText('What'))
    await waitFor(() =>
      expect(screen.getByText(/she _____ to work/i)).toBeInTheDocument()
    )
  })

  it('calls POST after answering all 5 questions', async () => {
    render(<NivelamentoPage />)
    const allAnswers = ['What', 'goes', 'had already started', 'was completed', 'would have done']
    for (const ans of allAnswers) {
      await waitFor(() => screen.getByText(ans))
      fireEvent.click(screen.getByText(ans))
    }
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/onboarding/progress',
        expect.objectContaining({ method: 'POST' })
      )
    )
  })
})
