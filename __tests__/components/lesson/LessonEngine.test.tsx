// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ ok: true, xp_earned: 50, next_lesson_slug: null }),
})

import { LessonEngine } from '@/app/licao/[slug]/LessonEngine'
import type { LessonContent } from '@/types/lesson'

const mockLesson: LessonContent = {
  slug: 'a1-lesson-01-greetings',
  level: 'A1',
  order: 1,
  title_en: 'Greetings',
  title_pt: 'Cumprimentos e Frases Básicas',
  emoji: '👋',
  estimated_minutes: 12,
  unlock_after: null,
  xp_reward: 50,
  vocabulary: [
    { word: 'Hello', translation_pt: 'Olá', emoji: '👋', pronunciation_hint: 'HEH-loh' },
  ],
  learning_objectives: [
    { id: 'obj-greet', description_pt: 'Cumprimentar alguém em inglês', vocab_words: ['Hello'] },
  ],
  steps: [
    { id: 'intro', type: 'intro', title_pt: 'Hoje você aprenderá', description_pt: 'Palavras essenciais.' },
    { id: 'summary', type: 'summary' },
  ],
}

describe('LessonEngine', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders intro step first', () => {
    render(<LessonEngine lesson={mockLesson} initialProgress={null} teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" />)
    expect(screen.getByText('Hoje você aprenderá')).toBeInTheDocument()
    expect(screen.getByText('Palavras essenciais.')).toBeInTheDocument()
  })

  it('shows step counter', () => {
    render(<LessonEngine lesson={mockLesson} initialProgress={null} teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" />)
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('advances to next step when Começar is clicked', async () => {
    render(<LessonEngine lesson={mockLesson} initialProgress={null} teacherName="Mrs. Carol" teacherImageUrl="/avatar.png" ttsVoice="alloy" />)
    fireEvent.click(screen.getByText('Começar →'))
    await waitFor(() => expect(screen.getByText('Aula concluída!')).toBeInTheDocument())
  })

  it('resumes from saved step index', () => {
    render(
      <LessonEngine
        lesson={mockLesson}
        initialProgress={{ lesson_slug: 'a1-lesson-01-greetings', status: 'in_progress', current_step_index: 1, vocab_scores: {}, completed_at: null, xp_earned: 0 }}
        teacherName="Mrs. Carol"
        teacherImageUrl="/avatar.png"
        ttsVoice="alloy"
      />
    )
    expect(screen.getByText('Aula concluída!')).toBeInTheDocument()
  })
})
