// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ audio_url: 'data:audio/mp3;base64,AAAA' }) })
window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)

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
})
