import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  createSupabaseClient: vi.fn(() => ({
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
  })),
}))

vi.mock('@/components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'dark' as const, toggle: vi.fn() }),
}))

vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <button>toggle</button>,
}))

import LoginPage from '@/app/login/page'

describe('LoginPage', () => {
  it('renders an email input', () => {
    render(<LoginPage />)
    expect(screen.getByPlaceholderText(/seu@email\.com/i)).toBeInTheDocument()
  })

  it('renders a password input', () => {
    render(<LoginPage />)
    expect(screen.getByPlaceholderText(/senha/i)).toBeInTheDocument()
  })

  it('renders the Google OAuth button', () => {
    render(<LoginPage />)
    expect(screen.getByText(/entrar com google/i)).toBeInTheDocument()
  })

  it('shows validation error when email is empty on submit', async () => {
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }))
    expect(await screen.findByText(/e-mail é obrigatório/i)).toBeInTheDocument()
  })

  it('shows validation error when password is empty on submit', async () => {
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText(/seu@email\.com/i), {
      target: { value: 'test@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^entrar$/i }))
    expect(await screen.findByText(/senha é obrigatória/i)).toBeInTheDocument()
  })
})
