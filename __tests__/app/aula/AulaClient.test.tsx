import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('@/hooks/useSession', () => ({
  useSession: vi.fn(() => ({
    sessionId: 'sess-1',
    topic: 'travel',
    messages: [
      { id: 'm1', role: 'user', text: 'Hello!', audio_url: null, audio_status: 'skipped', video_url: null, video_status: 'skipped', had_correction: false, pronunciation_hint: null, suggested_replies: null, reply_pt: null },
      { id: 'm2', role: 'assistant', text: 'Hi there!', audio_url: null, audio_status: 'ready', video_url: null, video_status: 'skipped', had_correction: false, pronunciation_hint: null, suggested_replies: null, reply_pt: null },
    ],
    loading: false,
    sending: false,
    initError: null,
    turnError: null,
    quotaExceeded: false,
    quotaInfo: null,
    lastPromptHint: null,
    sendTurn: vi.fn().mockResolvedValue(null),
    endSession: vi.fn(),
    retryAudio: vi.fn(),
  })),
}))

vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: vi.fn(() => ({
    isRecording: false,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    cancelRecording: vi.fn(),
    error: null,
  })),
}))

vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => <button>toggle</button> }))
vi.mock('@/components/ThemeProvider', () => ({ useTheme: () => ({ theme: 'dark', toggle: vi.fn() }) }))
vi.mock('@/components/lesson/LessonEngine', () => ({
  LessonEngine: ({ lesson }: { lesson: { title_pt: string } }) => <div>Lesson engine: {lesson.title_pt}</div>,
}))

import { useSession } from '@/hooks/useSession'
import { AulaClient } from '@/app/aula/AulaClient'

const mockTeacher = { id: 't1', slug: 'mr-jake', name: 'Mr. Jake', system_prompt: 'You are...', tts_voice: 'echo', tts_provider: 'openai' as const, avatar_image_url: '/avatars/mr-jake.png', levels: ['B1' as const, 'B2' as const], correction_style: 'conversational', memory_prefix: 'Mr. Jake notes:' }
const mockUser = { id: 'u1', email: 'a@b.com', name: 'Ana', created_at: '', plan_id: null, cefr_level: 'B1' as const, teacher_id: 't1', personal_context: null, streak_days: 0, last_session_at: null, preferred_session_time: null, theme: 'dark' as const }

describe('AulaClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders teacher name', async () => {
    render(<AulaClient teacher={mockTeacher} cefrLevel="B1" />)
    await waitFor(() => expect(screen.getByText('Mr. Jake')).toBeInTheDocument())
  })

  it('renders existing messages', async () => {
    render(<AulaClient teacher={mockTeacher} cefrLevel="B1" />)
    await waitFor(() => {
      expect(screen.getByText('Hello!')).toBeInTheDocument()
      expect(screen.getByText('Hi there!')).toBeInTheDocument()
    })
  })

  it('renders LessonEngine instead of the chat UI when the session mode is "lesson"', async () => {
    vi.mocked(useSession).mockReturnValue({
      sessionId: 'sess-1',
      topic: 'greetings',
      mode: 'lesson',
      lessonPlan: { title_pt: 'Cumprimentos', objective_pt: '', vocabulary: [], learning_objectives: [], steps: [] },
      messages: [],
      loading: false,
      sending: false,
      initError: null,
      turnError: null,
      quotaExceeded: false,
      quotaInfo: null,
      lastPromptHint: null,
      sendTurn: vi.fn(),
      endSession: vi.fn(),
      retryAudio: vi.fn(),
    })
    render(<AulaClient teacher={mockTeacher} cefrLevel="B1" />)
    await waitFor(() => expect(screen.getByText('Lesson engine: Cumprimentos')).toBeInTheDocument())
  })

  it('plays audio automatically once the last assistant message becomes ready', async () => {
    const playSpy = vi.fn().mockResolvedValue(undefined)
    const originalPlay = window.HTMLMediaElement.prototype.play
    window.HTMLMediaElement.prototype.play = playSpy

    vi.mocked(useSession).mockReturnValue({
      sessionId: 'sess-1',
      topic: null,
      messages: [
        { id: 'm1', role: 'user', text: 'Hi', audio_url: null, audio_status: 'skipped', video_url: null, video_status: 'skipped', had_correction: false, pronunciation_hint: null, suggested_replies: null, reply_pt: null },
        { id: 'm2', role: 'assistant', text: 'Hello!', audio_url: 'https://cdn.example.com/audio.mp3', audio_status: 'ready', video_url: null, video_status: 'skipped', had_correction: false, pronunciation_hint: null, suggested_replies: null, reply_pt: null },
      ],
      loading: false,
      sending: false,
      initError: null,
      turnError: null,
      quotaExceeded: false,
      quotaInfo: null,
      lastPromptHint: null,
      sendTurn: vi.fn(),
      endSession: vi.fn(),
      retryAudio: vi.fn(),
    })

    render(<AulaClient teacher={mockTeacher} cefrLevel="B1" />)
    await waitFor(() => expect(playSpy).toHaveBeenCalled())

    window.HTMLMediaElement.prototype.play = originalPlay

    // Restore the default mock so later tests in this file (which rely on the
    // `topic: 'travel'` default set by the vi.mock factory above) aren't
    // affected — mockReturnValue overrides persist across tests even though
    // beforeEach only clears call history, not implementations.
    vi.mocked(useSession).mockReturnValue({
      sessionId: 'sess-1',
      topic: 'travel',
      messages: [
        { id: 'm1', role: 'user', text: 'Hello!', audio_url: null, audio_status: 'skipped', video_url: null, video_status: 'skipped', had_correction: false, pronunciation_hint: null, suggested_replies: null, reply_pt: null },
        { id: 'm2', role: 'assistant', text: 'Hi there!', audio_url: null, audio_status: 'ready', video_url: null, video_status: 'skipped', had_correction: false, pronunciation_hint: null, suggested_replies: null, reply_pt: null },
      ],
      loading: false,
      sending: false,
      initError: null,
      turnError: null,
      quotaExceeded: false,
      quotaInfo: null,
      lastPromptHint: null,
      sendTurn: vi.fn().mockResolvedValue(null),
      endSession: vi.fn(),
      retryAudio: vi.fn(),
    })
  })

  it('renders a record button', async () => {
    render(<AulaClient teacher={mockTeacher} cefrLevel="B1" />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /iniciar gravação/i })).toBeInTheDocument()
    )
  })

  it('renders topic badge when topic is set', async () => {
    render(<AulaClient teacher={mockTeacher} cefrLevel="B1" />)
    await waitFor(() => expect(screen.getByText('Viagens')).toBeInTheDocument())
  })

  it('wires onRetryAudio to retryAudio for the last assistant message and calls it on click', async () => {
    const retryAudioMock = vi.fn()
    vi.mocked(useSession).mockReturnValue({
      sessionId: 'sess-1',
      topic: 'travel',
      messages: [
        { id: 'm1', role: 'user', text: 'Hello!', audio_url: null, audio_status: 'skipped', video_url: null, video_status: 'skipped', had_correction: false, pronunciation_hint: null, suggested_replies: null, reply_pt: null },
        { id: 'm2', role: 'assistant', text: 'Hi there!', audio_url: null, audio_status: 'failed', video_url: null, video_status: 'skipped', had_correction: false, pronunciation_hint: null, suggested_replies: null, reply_pt: null },
      ],
      loading: false,
      sending: false,
      initError: null,
      turnError: null,
      quotaExceeded: false,
      quotaInfo: null,
      lastPromptHint: null,
      sendTurn: vi.fn().mockResolvedValue(null),
      endSession: vi.fn(),
      retryAudio: retryAudioMock,
    })

    render(<AulaClient teacher={mockTeacher} cefrLevel="B1" />)
    const retryButton = await screen.findByTestId('audio-failed')
    fireEvent.click(retryButton)

    expect(retryAudioMock).toHaveBeenCalledWith('m2')

    // Restore the default mock so later tests in this file aren't affected.
    vi.mocked(useSession).mockReturnValue({
      sessionId: 'sess-1',
      topic: 'travel',
      messages: [
        { id: 'm1', role: 'user', text: 'Hello!', audio_url: null, audio_status: 'skipped', video_url: null, video_status: 'skipped', had_correction: false, pronunciation_hint: null, suggested_replies: null, reply_pt: null },
        { id: 'm2', role: 'assistant', text: 'Hi there!', audio_url: null, audio_status: 'ready', video_url: null, video_status: 'skipped', had_correction: false, pronunciation_hint: null, suggested_replies: null, reply_pt: null },
      ],
      loading: false,
      sending: false,
      initError: null,
      turnError: null,
      quotaExceeded: false,
      quotaInfo: null,
      lastPromptHint: null,
      sendTurn: vi.fn().mockResolvedValue(null),
      endSession: vi.fn(),
      retryAudio: vi.fn(),
    })
  })

  it('shows session report modal after ending session', async () => {
    const endSessionMock = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useSession).mockReturnValue({
      sessionId: 'sess-1',
      topic: null,
      messages: [],
      loading: false,
      sending: false,
      initError: null,
      turnError: null,
      quotaExceeded: false,
      quotaInfo: null,
      lastPromptHint: null,
      sendTurn: vi.fn(),
      endSession: endSessionMock,
      retryAudio: vi.fn(),
    })

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/assess')) {
        return Promise.resolve({ ok: true, json: async () => ({ too_short: true }) })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          userMessages: 3,
          corrections: 1,
          pronunciationHints: 0,
          durationSeconds: 120,
          missionCompleted: false,
          missionTitle: 'Apresentação completa',
        }),
      })
    })

    render(<AulaClient teacher={mockTeacher} cefrLevel="B1" />)
    const endButton = screen.getByText(/encerrar aula/i)
    await act(async () => { fireEvent.click(endButton) })
    await waitFor(() => expect(screen.getByText('Resumo da aula')).toBeInTheDocument())
  })

  it('renders quota exceeded banner when quotaExceeded is true', () => {
    vi.mocked(useSession).mockReturnValue({
      sessionId: 'sess-1',
      topic: null,
      messages: [],
      loading: false,
      sending: false,
      initError: null,
      turnError: null,
      quotaExceeded: true,
      quotaInfo: { minutesUsed: 10.5, minutesLimit: 10 },
      lastPromptHint: null,
      sendTurn: vi.fn(),
      endSession: vi.fn(),
      retryAudio: vi.fn(),
    })

    render(<AulaClient teacher={mockTeacher} cefrLevel="B1" />)

    expect(screen.getByText('Sua Demonstração Premium chegou ao fim.')).toBeInTheDocument()
    expect(screen.getByText(/Esperamos que você tenha conhecido/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver planos e assinar' })).toHaveAttribute('href', '/planos')
  })
})
