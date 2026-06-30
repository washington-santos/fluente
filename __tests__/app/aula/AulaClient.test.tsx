import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('@/hooks/useSession', () => ({
  useSession: vi.fn(() => ({
    sessionId: 'sess-1',
    messages: [
      { role: 'user', text: 'Hello!', audio_url: null, had_correction: false },
      { role: 'assistant', text: 'Hi there!', audio_url: null, had_correction: false },
    ],
    loading: false,
    sending: false,
    initError: null,
    turnError: null,
    quotaExceeded: false,
    quotaInfo: null,
    sendTurn: vi.fn().mockResolvedValue(null),
    endSession: vi.fn(),
  })),
}))

vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: vi.fn(() => ({
    isRecording: false,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    error: null,
  })),
}))

vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => <button>toggle</button> }))
vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => ({ theme: 'dark', toggle: vi.fn() }) }))

import { useSession } from '@/hooks/useSession'
import { AulaClient } from '@/app/aula/AulaClient'

const mockTeacher = { id: 't1', slug: 'mr-jake', name: 'Mr. Jake', system_prompt: 'You are...', tts_voice: 'echo', tts_provider: 'openai' as const, avatar_image_url: '/avatars/mr-jake.png', levels: ['B1' as const, 'B2' as const], correction_style: 'conversational', memory_prefix: 'Mr. Jake notes:' }
const mockUser = { id: 'u1', email: 'a@b.com', name: 'Ana', created_at: '', plan_id: null, cefr_level: 'B1' as const, teacher_id: 't1', personal_context: null, streak_days: 0, last_session_at: null, preferred_session_time: null, theme: 'dark' as const }

describe('AulaClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders teacher name', async () => {
    render(<AulaClient teacher={mockTeacher} />)
    await waitFor(() => expect(screen.getByText('Mr. Jake')).toBeInTheDocument())
  })

  it('renders existing messages', async () => {
    render(<AulaClient teacher={mockTeacher} />)
    await waitFor(() => {
      expect(screen.getByText('Hello!')).toBeInTheDocument()
      expect(screen.getByText('Hi there!')).toBeInTheDocument()
    })
  })

  it('renders a record button', async () => {
    render(<AulaClient teacher={mockTeacher} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /iniciar gravação/i })).toBeInTheDocument()
    )
  })

  it('renders quota exceeded banner when quotaExceeded is true', () => {
    vi.mocked(useSession).mockReturnValue({
      sessionId: 'sess-1',
      messages: [],
      loading: false,
      sending: false,
      initError: null,
      turnError: null,
      quotaExceeded: true,
      quotaInfo: { minutesUsed: 10.5, minutesLimit: 10 },
      sendTurn: vi.fn(),
      endSession: vi.fn(),
    })

    render(<AulaClient teacher={mockTeacher} />)

    expect(screen.getByText('Limite do plano atingido')).toBeInTheDocument()
    expect(screen.getByText(/10\.5.*de.*10.*minutos/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver planos' })).toHaveAttribute('href', '/planos')
  })
})
