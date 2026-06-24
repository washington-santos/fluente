import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url === '/api/onboarding/progress') {
    return Promise.resolve({
      ok: true,
      json: async () => ({ progress: { current_step: 4, written_answers: ['trabalho', '20min', '[]', 'B1'], completed_at: null } }),
    })
  }
  return Promise.resolve({ ok: true, json: async () => ({ level: 'B1', transcript: 'I work as an engineer.' }) })
})

vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => ({ theme: 'dark' as const, toggle: vi.fn() }) }))
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => <button>toggle</button> }))

import ConversaPage from '@/app/cadastro/conversa/page'

describe('ConversaPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the Mrs. Carol prompt text', async () => {
    render(<ConversaPage />)
    await waitFor(() =>
      expect(screen.getByText(/mrs\. carol diz/i)).toBeInTheDocument()
    )
  })

  it('renders a record button', async () => {
    render(<ConversaPage />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /gravar|iniciar/i })).toBeInTheDocument()
    )
  })
})
