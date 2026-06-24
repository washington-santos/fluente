import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const pushMock = vi.fn()
const saveStepMock = vi.fn().mockResolvedValue(undefined)

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
vi.mock('@/hooks/useOnboardingProgress', () => ({
  useOnboardingProgress: () => ({
    progress: { current_step: 2, written_answers: ['trabalho'], completed_at: null },
    loading: false,
    saveStep: saveStepMock,
  }),
}))
vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => ({ theme: 'dark' as const, toggle: vi.fn() }) }))
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => <button>toggle</button> }))

import HorarioPage from '@/app/cadastro/horario/page'

describe('HorarioPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders 3 commitment options', () => {
    render(<HorarioPage />)
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(3)
  })

  it('shows error when continuing without selection', async () => {
    render(<HorarioPage />)
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    expect(await screen.findByText(/selecione uma opção/i)).toBeInTheDocument()
  })

  it('calls POST on valid selection + continue', async () => {
    render(<HorarioPage />)
    fireEvent.click(screen.getByText(/10 minutos/i))
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() =>
      expect(saveStepMock).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ written_answers: ['trabalho', '10min'] })
      )
    )
  })
})
