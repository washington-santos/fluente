import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

const fetchMock = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ progress: null }),
})
global.fetch = fetchMock

vi.mock('@/lib/supabase', () => ({
  createSupabaseClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    })),
  })),
}))

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'dark' as const, toggle: vi.fn() }),
}))
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => <button>toggle</button> }))

vi.mock('@/hooks/useOnboardingProgress', () => ({
  useOnboardingProgress: vi.fn(() => ({
    progress: null,
    loading: false,
    saveStep: vi.fn(async (step: number) => {
      await fetchMock('/api/onboarding/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step }),
      })
      pushMock('/cadastro/objetivo')
    }),
  })),
}))

import BoasVindasPage from '@/app/cadastro/boas-vindas/page'

describe('BoasVindasPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a name input', () => {
    render(<BoasVindasPage />)
    expect(screen.getByPlaceholderText(/seu nome/i)).toBeInTheDocument()
  })

  it('shows error when submitting empty name', async () => {
    render(<BoasVindasPage />)
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    expect(await screen.findByText(/nome é obrigatório/i)).toBeInTheDocument()
  })

  it('calls fetch with step=1 on valid submit', async () => {
    render(<BoasVindasPage />)
    fireEvent.change(screen.getByPlaceholderText(/seu nome/i), { target: { value: 'Ana' } })
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/onboarding/progress',
        expect.objectContaining({ method: 'POST' })
      )
    )
  })
})
