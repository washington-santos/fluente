// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GuidedConvoStep } from '@/components/lesson/GuidedConvoStep'

vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: vi.fn((opts: { onComplete: (blob: Blob) => void }) => ({
    isRecording: false,
    startRecording: () => opts.onComplete(new Blob(['audio'], { type: 'audio/webm' })),
    stopRecording: vi.fn(),
    error: null,
  })),
}))

global.fetch = vi.fn()

// jsdom's HTMLMediaElement never fires real 'ended'/'playing' events on its own —
// GuidedConvoStep's flow depends on audio.onended firing to advance (autoplay →
// record → assess). This mock constructor auto-fires onended on the next
// microtask after play() so the component's callback chain actually runs,
// the same way a real (very short) audio clip finishing would.
class MockAudio {
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  onplaying: (() => void) | null = null
  constructor(public src?: string) {}
  play() {
    queueMicrotask(() => this.onended?.())
    return Promise.resolve()
  }
  pause() {}
}
vi.stubGlobal('Audio', MockAudio)

const baseStep = {
  id: 'gc-1',
  type: 'guided_convo' as const,
  instruction_pt: 'Converse sobre seu nome.',
  teacher_opens_with: "What's your name?",
  teacher_opens_with_pt: 'Qual é o seu nome?',
  allowed_vocabulary: ['name', 'hello'],
  min_exchanges: 1,
}

function mockFetchSequence(...responses: object[]) {
  let call = 0
  vi.mocked(fetch).mockImplementation(() => {
    const res = responses[call] ?? responses[responses.length - 1]
    call++
    return Promise.resolve({ ok: true, json: async () => res } as Response)
  })
}

describe('GuidedConvoStep', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the teacher opening line', () => {
    mockFetchSequence({ audio_url: 'data:audio/mp3;base64,AAAA' })
    render(
      <GuidedConvoStep step={baseStep} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />
    )
    expect(screen.getByText("What's your name?")).toBeInTheDocument()
  })

  it('posts to /api/conversation with session_id, audio, and guided_vocab when the student speaks', async () => {
    mockFetchSequence(
      { audio_url: 'data:audio/mp3;base64,AAAA' }, // initial TTS
      { message_id: 'm1', text: 'Nice to meet you!', reply_pt: 'Prazer!', transcript: 'My name is Ana', had_correction: false, audio_url: null, audio_status: 'pending', video_url: null, video_status: 'skipped' },
      { audio_url: 'data:audio/mp3;base64,BBBB' }, // reply TTS
    )
    render(
      <GuidedConvoStep step={baseStep} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />
    )
    // The mic button starts disabled while the initial teacher-question TTS loads/plays
    // (isSpeaking=true on mount). Wait for that to settle before tapping, otherwise the
    // click lands on a disabled button and never starts recording.
    await waitFor(() => expect(screen.getByLabelText('Ouvir pergunta')).not.toBeDisabled())
    fireEvent.click(screen.getByLabelText('Ouvir pergunta'))

    await waitFor(() => {
      const convoCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === '/api/conversation')
      expect(convoCall).toBeTruthy()
    })
    const convoCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === '/api/conversation')
    const body = convoCall![1].body as FormData
    expect(body.get('session_id')).toBe('sess-1')
    expect(body.get('guided_vocab')).toBe(JSON.stringify(['name', 'hello']))
    expect(body.get('audio')).toBeInstanceOf(Blob)
  })

  it('sends is_challenge=true when the step is marked as the final challenge', async () => {
    mockFetchSequence(
      { audio_url: 'data:audio/mp3;base64,AAAA' },
      { message_id: 'm1', text: 'Great!', reply_pt: 'Ótimo!', transcript: 'My name is Ana', had_correction: false, audio_url: null, audio_status: 'pending', video_url: null, video_status: 'skipped' },
      { audio_url: 'data:audio/mp3;base64,BBBB' },
    )
    render(
      <GuidedConvoStep step={{ ...baseStep, is_challenge: true }} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />
    )
    expect(screen.getByText('🏆 Desafio final')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Ouvir pergunta')).not.toBeDisabled())
    fireEvent.click(screen.getByLabelText('Ouvir pergunta'))
    await waitFor(() => {
      const convoCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === '/api/conversation')
      expect(convoCall).toBeTruthy()
    })
    const convoCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === '/api/conversation')
    const body = convoCall![1].body as FormData
    expect(body.get('is_challenge')).toBe('true')
  })

  it('shows a quota-specific message when /api/conversation returns 429', async () => {
    let call = 0
    vi.mocked(fetch).mockImplementation((url) => {
      if (url === '/api/conversation') {
        call++
        return Promise.resolve({ ok: false, status: 429, json: async () => ({ error: 'quota_exceeded', minutesUsed: 300, minutesLimit: 300 }) } as Response)
      }
      return Promise.resolve({ ok: true, json: async () => ({ audio_url: 'data:audio/mp3;base64,AAAA' }) } as Response)
    })
    render(
      <GuidedConvoStep step={baseStep} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />
    )
    await waitFor(() => expect(screen.getByLabelText('Ouvir pergunta')).not.toBeDisabled())
    fireEvent.click(screen.getByLabelText('Ouvir pergunta'))

    await waitFor(() => {
      expect(screen.getByText('Você atingiu o limite do seu plano. Veja seus planos para continuar.')).toBeInTheDocument()
    })
    expect(screen.queryByText('Não entendi. Fale mais devagar e tente novamente. 🎙️')).not.toBeInTheDocument()
    expect(call).toBeGreaterThan(0)
  })

  it('sends speed=0.85 in TTS requests when strugglingMode is on', async () => {
    mockFetchSequence({ audio_url: 'data:audio/mp3;base64,AAAA' })
    render(
      <GuidedConvoStep step={baseStep} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" strugglingMode onComplete={vi.fn()} />
    )
    await waitFor(() => {
      const ttsCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === '/api/lesson/tts')
      expect(ttsCall).toBeTruthy()
      const body = ttsCall![1].body as FormData
      expect(body.get('speed')).toBe('0.85')
    })
  })

  it('sends speed=1.0 by default', async () => {
    mockFetchSequence({ audio_url: 'data:audio/mp3;base64,AAAA' })
    render(
      <GuidedConvoStep step={baseStep} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />
    )
    await waitFor(() => {
      const ttsCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === '/api/lesson/tts')
      expect(ttsCall).toBeTruthy()
      const body = ttsCall![1].body as FormData
      expect(body.get('speed')).toBe('1.0')
    })
  })

  it('reports the correction rate to onComplete when the conversation finishes', async () => {
    mockFetchSequence(
      { audio_url: 'data:audio/mp3;base64,AAAA' }, // initial TTS
      { message_id: 'm1', text: 'Try again', reply_pt: 'Tente de novo', transcript: 'bad answer', had_correction: true, audio_url: null, audio_status: 'pending', video_url: null, video_status: 'skipped' },
      { audio_url: 'data:audio/mp3;base64,BBBB' }, // reply TTS after 1st exchange
      { message_id: 'm2', text: 'Great!', reply_pt: 'Ótimo!', transcript: 'good answer', had_correction: false, audio_url: null, audio_status: 'pending', video_url: null, video_status: 'skipped' },
      { audio_url: 'data:audio/mp3;base64,CCCC' }, // reply TTS after 2nd exchange
    )
    const onComplete = vi.fn()
    render(
      <GuidedConvoStep step={{ ...baseStep, min_exchanges: 1 }} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={onComplete} />
    )
    await waitFor(() => expect(screen.getByLabelText('Ouvir pergunta')).not.toBeDisabled())
    fireEvent.click(screen.getByLabelText('Ouvir pergunta'))

    await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByLabelText('Ouvir pergunta')).not.toBeDisabled())
    fireEvent.click(screen.getByLabelText('Ouvir pergunta'))

    // Note: the mic-hint text 'Pronto para continuar!' is gated behind `awaitingListen`
    // (which the component resets to `true` at the top of every playCurrentTts call, and
    // MockAudio never fires `onplaying` to clear it — see the MockAudio comment above), so
    // that hint never actually becomes visible in this mocked flow. The finish button's
    // visibility only depends on `canComplete`, so we wait on that directly instead.
    await waitFor(() => expect(screen.getByText('Finalizar conversa →')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Finalizar conversa →'))
    expect(onComplete).toHaveBeenCalledWith(0.5)
  })
})
