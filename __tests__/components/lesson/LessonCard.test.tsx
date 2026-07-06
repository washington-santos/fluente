// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))

import { LessonCard } from '@/components/lesson/LessonCard'
import type { LessonWithProgress } from '@/types/lesson'

const base: LessonWithProgress = {
  slug: 'a1-lesson-01-greetings',
  level: 'A1',
  order: 1,
  title_en: 'Greetings',
  title_pt: 'Cumprimentos',
  emoji: '👋',
  estimated_minutes: 12,
  unlock_after: null,
  xp_reward: 50,
  vocabulary: [],
  learning_objectives: [],
  steps: [],
  progress: null,
}

describe('LessonCard', () => {
  it('renders lesson title and order', () => {
    render(<LessonCard lesson={{ ...base, progress: { lesson_slug: base.slug, status: 'available', current_step_index: 0, vocab_scores: {}, completed_at: null, xp_earned: 0 } }} />)
    expect(screen.getByText('Cumprimentos')).toBeInTheDocument()
    expect(screen.getByText('Lição 1')).toBeInTheDocument()
  })

  it('renders as a link when status is available', () => {
    render(<LessonCard lesson={{ ...base, progress: { lesson_slug: base.slug, status: 'available', current_step_index: 0, vocab_scores: {}, completed_at: null, xp_earned: 0 } }} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/licao/a1-lesson-01-greetings')
  })

  it('renders as a link when status is in_progress', () => {
    render(<LessonCard lesson={{ ...base, progress: { lesson_slug: base.slug, status: 'in_progress', current_step_index: 5, vocab_scores: {}, completed_at: null, xp_earned: 0 } }} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/licao/a1-lesson-01-greetings')
  })

  it('shows lock icon and no link when locked', () => {
    render(<LessonCard lesson={{ ...base, unlock_after: 'other', progress: { lesson_slug: base.slug, status: 'locked', current_step_index: 0, vocab_scores: {}, completed_at: null, xp_earned: 0 } }} />)
    expect(screen.getByText('🔒')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows lock icon and no link when no progress and has unlock_after', () => {
    render(<LessonCard lesson={{ ...base, unlock_after: 'other', progress: null }} />)
    expect(screen.getByText('🔒')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows checkmark when completed', () => {
    render(<LessonCard lesson={{ ...base, progress: { lesson_slug: base.slug, status: 'completed', current_step_index: 23, vocab_scores: {}, completed_at: '2026-07-03T00:00:00Z', xp_earned: 50 } }} />)
    expect(screen.getByText('✓')).toBeInTheDocument()
  })
})
