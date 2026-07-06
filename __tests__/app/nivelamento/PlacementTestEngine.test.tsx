// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('@/components/placement/PlacementPhaseCard', () => ({
  PlacementPhaseCard: ({ onAnswer }: { onAnswer: (t: string, s: number) => void }) => (
    <button onClick={() => onAnswer('my answer', 0.7)}>Responder</button>
  ),
}))

vi.mock('@/components/placement/PlacementDiagnosticReport', () => ({
  PlacementDiagnosticReport: ({ onContinue }: { onContinue: () => void }) => (
    <button onClick={onContinue}>Começar aulas</button>
  ),
}))

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    result: {
      id: 'r1', user_id: 'u1', cefr_level: 'A2',
      speaking_pct: 55, listening_pct: 60, grammar_pct: 45,
      vocabulary_pct: 65, pronunciation_pct: 40, confidence_pct: 50,
      biggest_difficulty: 'TH', biggest_strength: 'vocab',
      next_objective: 'fluência', completed_at: '2026-07-06T00:00:00Z',
    },
    plan: {
      id: 'p1', user_id: 'u1', goal: 'viagem',
      focus_areas: ['pronunciation'], plan_summary_pt: 'Plano para 30 dias.',
      cefr_at_creation: 'A2', created_at: '2026-07-06T00:00:00Z',
    },
  }),
})

import { PlacementTestEngine } from '@/app/nivelamento/PlacementTestEngine'

describe('PlacementTestEngine', () => {
  it('shows intro screen on load', () => {
    render(<PlacementTestEngine teacherName="Mrs. Carol" teacherVoice="shimmer" userGoal="viagem" />)
    expect(screen.getByText(/começar/i)).toBeInTheDocument()
  })

  it('advances through questions when answered', async () => {
    render(<PlacementTestEngine teacherName="Mrs. Carol" teacherVoice="shimmer" userGoal="viagem" />)
    fireEvent.click(screen.getByText(/começar/i))
    await waitFor(() => expect(screen.getByText('Responder')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Responder'))
    await waitFor(() => expect(screen.queryByText('Responder')).toBeInTheDocument())
  })
})
