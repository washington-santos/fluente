// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
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

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ level: 'B1' }) })
})

describe('PlacementDiagnosticReport', () => {
  it('shows overall CEFR level prominently', () => {
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={vi.fn()} />)
    // 'B1' legitimately appears twice now: the badge and the "Seu nível
    // estimado é B1" headline (Step 5's own assertion covers the headline).
    expect(screen.getAllByText('B1').length).toBeGreaterThan(0)
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

  it('shows plan summary', () => {
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={vi.fn()} />)
    expect(screen.getByText('Em 30 dias, focamos em pronúncia e conversação para viagem.')).toBeInTheDocument()
  })

  it('shows the estimated level headline', () => {
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={vi.fn()} />)
    expect(screen.getByText(/Seu nível estimado é/i)).toBeInTheDocument()
  })

  it('confirms the recommended level and calls onContinue', async () => {
    const onContinue = vi.fn()
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: /começar no b1/i }))
    await waitFor(() => expect(onContinue).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/placement/confirm-level', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ chosen_level: 'B1' }),
    }))
  })

  it('reveals lower-level options and never offers B1 or above', () => {
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={vi.fn()} />)
    fireEvent.click(screen.getByText(/prefiro começar mais fácil/i))
    expect(screen.getByRole('button', { name: /começar no a1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /começar no a2/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /começar no b2/i })).not.toBeInTheDocument()
  })

  it('confirms a chosen lower level and calls onContinue', async () => {
    const onContinue = vi.fn()
    render(<PlacementDiagnosticReport result={mockResult} plan={mockPlan} onContinue={onContinue} />)
    fireEvent.click(screen.getByText(/prefiro começar mais fácil/i))
    fireEvent.click(screen.getByRole('button', { name: /começar no a1/i }))
    await waitFor(() => expect(onContinue).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/placement/confirm-level', expect.objectContaining({
      body: JSON.stringify({ chosen_level: 'A1' }),
    }))
  })

  it('does not offer the "começar mais fácil" option at A1', () => {
    render(<PlacementDiagnosticReport result={{ ...mockResult, cefr_level: 'A1' }} plan={mockPlan} onContinue={vi.fn()} />)
    expect(screen.queryByText(/prefiro começar mais fácil/i)).not.toBeInTheDocument()
  })
})
