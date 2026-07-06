// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { PlacementDiagnosticReport } from '@/components/placement/PlacementDiagnosticReport'
import type { PlacementResult, LearningPlan } from '@/types'

const mockResult: PlacementResult = {
  id: 'r1', user_id: 'u1',
  cefr_level: 'B1',
  speaking_pct: 68, listening_pct: 75, grammar_pct: 55,
  vocabulary_pct: 72, pronunciation_pct: 48, confidence_pct: 60,
  biggest_difficulty: 'Pronúncia do TH',
  biggest_strength: 'Vocabulário básico',
  next_objective: 'Melhorar fluência ao falar sobre rotinas',
  completed_at: '2026-07-06T00:00:00Z',
}

const mockPlan: LearningPlan = {
  id: 'p1', user_id: 'u1',
  goal: 'viagem',
  focus_areas: ['pronunciation', 'speaking'],
  plan_summary_pt: 'Em 30 dias, focamos em pronúncia e conversação para viagem.',
  cefr_at_creation: 'B1',
  created_at: '2026-07-06T00:00:00Z',
}

describe('PlacementDiagnosticReport', () => {
  it('shows overall CEFR level prominently', () => {
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={vi.fn()} />)
    expect(screen.getByText('B1')).toBeInTheDocument()
  })

  it('shows all 5 skill percentages', () => {
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={vi.fn()} />)
    expect(screen.getByText('68%')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('48%')).toBeInTheDocument()
  })

  it('shows difficulty and strength', () => {
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={vi.fn()} />)
    expect(screen.getByText('Pronúncia do TH')).toBeInTheDocument()
    expect(screen.getByText('Vocabulário básico')).toBeInTheDocument()
  })

  it('calls onContinue when CTA is clicked', () => {
    const onContinue = vi.fn()
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: /começar/i }))
    expect(onContinue).toHaveBeenCalled()
  })

  it('shows plan summary', () => {
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={vi.fn()} />)
    expect(screen.getByText('Em 30 dias, focamos em pronúncia e conversação para viagem.')).toBeInTheDocument()
  })
})
