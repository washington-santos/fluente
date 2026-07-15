// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ audio_url: 'data:audio/mp3;base64,AAAA' }) })
window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)

vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: vi.fn(() => ({
    isRecording: false,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    error: null,
  })),
}))

// jsdom never fires real 'ended'/'playing' events on HTMLMediaElement — this
// mock auto-fires onended on the next microtask, matching the pattern already
// used in GuidedConvoStep.test.tsx for the same reason.
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

import { LessonEngine } from '@/components/lesson/LessonEngine'
import type { GeneratedLesson } from '@/types/lesson'

const mockLesson: GeneratedLesson = {
  title_pt: 'Cumprimentos',
  objective_pt: 'Aprender a cumprimentar alguém.',
  vocabulary: [{ word: 'Hello', translation_pt: 'Olá', emoji: '👋', pronunciation_hint: 'HEH-loh' }],
  learning_objectives: [{ id: 'obj-1', description_pt: 'Cumprimentar alguém em inglês', vocab_words: ['Hello'] }],
  steps: [
    { id: 'intro', type: 'intro', title_pt: 'Cumprimentos', description_pt: 'Hoje você vai aprender a cumprimentar.' },
    { id: 'summary', type: 'summary' },
  ],
}

describe('LessonEngine', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the intro step first, with the step counter', () => {
    render(<LessonEngine lesson={mockLesson} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />)
    expect(screen.getByText('Hoje você vai aprender a cumprimentar.')).toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('advances to the summary step when Começar is tapped', async () => {
    render(<LessonEngine lesson={mockLesson} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Começar →'))
    await waitFor(() => expect(screen.getByText('Aula concluída!')).toBeInTheDocument())
  })

  it('calls onComplete (not any /api/lesson/complete call) when the summary is finished', async () => {
    const onComplete = vi.fn()
    render(<LessonEngine lesson={mockLesson} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Começar →'))
    await waitFor(() => screen.getByText('Aula concluída!'))
    fireEvent.click(screen.getByText('Continuar aprendendo →'))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.some(c => String(c[0]).includes('/api/lesson/complete'))).toBe(false)
  })

  it('renders a warmup_review step first when present, before intro', () => {
    const lessonWithWarmup: GeneratedLesson = {
      ...mockLesson,
      steps: [
        { id: 'warmup', type: 'warmup_review', recent_summary_pt: 'Você praticou saudações.', frequent_errors_pt: [], recent_words: [] },
        ...mockLesson.steps,
      ],
    }
    render(<LessonEngine lesson={lessonWithWarmup} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />)
    expect(screen.getByText('Você praticou saudações.')).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('accumulates struggle events from wrong exercise answers, clones the missed exercise for a retry, and shortens the next guided-convo step once struggling mode is on', async () => {
    const lesson: GeneratedLesson = {
      ...mockLesson,
      steps: [
        { id: 'ex-1', type: 'exercise_choice', question_pt: 'Q1?', image_emoji: '❓', correct_answer: 'A', choices: ['A', 'B'], explanation_pt: 'exp1' },
        { id: 'ex-2', type: 'exercise_choice', question_pt: 'Q2?', image_emoji: '❓', correct_answer: 'A', choices: ['A', 'B'], explanation_pt: 'exp2' },
        { id: 'gc-1', type: 'guided_convo', instruction_pt: 'inst', teacher_opens_with: 'Hi', allowed_vocabulary: ['Hello'], min_exchanges: 3 },
        { id: 'summary', type: 'summary' },
      ],
    }
    render(<LessonEngine lesson={lesson} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />)

    // Wrong answer on ex-1 — 1st struggle event, not enough to trigger struggling mode yet
    fireEvent.click(screen.getByText('B'))
    fireEvent.click(screen.getByText('Continuar →'))

    // Wrong answer on ex-2 — 2nd struggle event, crosses the threshold
    await waitFor(() => screen.getByText('Q2?'))
    fireEvent.click(screen.getByText('B'))
    fireEvent.click(screen.getByText('Continuar →'))

    // ex-2 was cloned as an immediate retry — the same question appears again
    await waitFor(() => expect(screen.getByText('Q2?')).toBeInTheDocument())
    fireEvent.click(screen.getByText('A'))
    fireEvent.click(screen.getByText('Continuar →'))

    // Now on the guided_convo step: min_exchanges was reduced from 3 to 2
    await waitFor(() => expect(screen.getByLabelText('Ouvir pergunta')).not.toBeDisabled())
    fireEvent.click(screen.getByLabelText('Ouvir pergunta'))
    await waitFor(() => expect(screen.getByText('0 / 2 trocas')).toBeInTheDocument())
  })

  it('renders a grammar_present step and counts a wrong grammar exercise answer toward struggle events', async () => {
    const lesson: GeneratedLesson = {
      ...mockLesson,
      steps: [
        { id: 'gr-1', type: 'grammar_present', teacher_script: 'Learn possessives.', explanation_pt: 'Use my/his/her.', example_sentence_en: 'This is my book.', example_sentence_pt: 'Este é meu livro.' },
        { id: 'ex-1', type: 'exercise_choice', question_pt: 'Q1?', image_emoji: '📐', correct_answer: 'A', choices: ['A', 'B'], explanation_pt: 'exp1' },
        { id: 'ex-2', type: 'exercise_choice', question_pt: 'Q2?', image_emoji: '❓', correct_answer: 'A', choices: ['A', 'B'], explanation_pt: 'exp2' },
        { id: 'summary', type: 'summary' },
      ],
    }
    render(<LessonEngine lesson={lesson} sessionId="sess-1" teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" onComplete={vi.fn()} />)

    expect(screen.getByText('Use my/his/her.')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Entendi! Continuar →'))

    // Wrong answer on the grammar exercise (ex-1) — 1st struggle event, not enough yet
    await waitFor(() => screen.getByText('Q1?'))
    fireEvent.click(screen.getByText('B'))
    fireEvent.click(screen.getByText('Continuar →'))

    // Wrong answer on ex-2 — 2nd struggle event, crosses the threshold
    await waitFor(() => screen.getByText('Q2?'))
    fireEvent.click(screen.getByText('B'))
    fireEvent.click(screen.getByText('Continuar →'))

    // ex-2 was cloned as an immediate retry — the same question appears again
    await waitFor(() => expect(screen.getByText('Q2?')).toBeInTheDocument())
  })
})
