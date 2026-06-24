import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    progress: {
      current_step: 5,
      written_answers: ['trabalho', '20min', '["What","goes","had already started","wrong","wrong"]', 'B1', 'B1'],
      conversation_transcript: 'I work as an engineer.',
      completed_at: null,
    },
  }),
})

vi.mock('@/lib/supabase', () => ({
  createSupabaseClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'teacher-uuid' }, error: null }),
        })),
      })),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    })),
  })),
}))

vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => ({ theme: 'dark' as const, toggle: vi.fn() }) }))
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => <button>toggle</button> }))

import ProfessorPage from '@/app/cadastro/professor/page'

describe('ProfessorPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a CEFR level badge after loading', async () => {
    render(<ProfessorPage />)
    await waitFor(() =>
      expect(screen.getAllByText(/B1/).length).toBeGreaterThan(0)
    )
  })

  it('renders the assigned teacher name', async () => {
    render(<ProfessorPage />)
    await waitFor(() =>
      expect(screen.getByText(/Mr\. Jake/i)).toBeInTheDocument()
    )
  })

  it('renders a confirm button', async () => {
    render(<ProfessorPage />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /começar/i })).toBeInTheDocument()
    )
  })
})
