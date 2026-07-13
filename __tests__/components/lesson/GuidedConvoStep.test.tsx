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
})
