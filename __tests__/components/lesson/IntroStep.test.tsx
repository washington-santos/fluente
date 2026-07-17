// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { IntroStep } from '@/components/lesson/IntroStep'
import type { IntroStep as StepType } from '@/types/lesson'

const baseStep: StepType = {
  id: 'intro-1',
  type: 'intro',
  title_pt: 'Apresentações pessoais',
  description_pt: 'Você vai aprender a se apresentar.',
}

describe('IntroStep', () => {
  it('shows the choice explanation when present', () => {
    const step: StepType = { ...baseStep, choice_explanation_pt: 'Hoje é um tópico novo pra você: "Apresentações pessoais".' }
    render(<IntroStep step={step} vocabulary={[]} learningObjectives={[]} onContinue={vi.fn()} />)
    expect(screen.getByText('Hoje é um tópico novo pra você: "Apresentações pessoais".')).toBeInTheDocument()
  })

  it('renders nothing extra when choice_explanation_pt is absent', () => {
    render(<IntroStep step={baseStep} vocabulary={[]} learningObjectives={[]} onContinue={vi.fn()} />)
    expect(screen.queryByText('💡')).not.toBeInTheDocument()
  })

  it('still shows the title and description', () => {
    render(<IntroStep step={baseStep} vocabulary={[]} learningObjectives={[]} onContinue={vi.fn()} />)
    expect(screen.getByText('Apresentações pessoais')).toBeInTheDocument()
    expect(screen.getByText('Você vai aprender a se apresentar.')).toBeInTheDocument()
  })

  it('shows the NPC intro note when npc_intro_pt is present', () => {
    const step: StepType = { ...baseStep, npc_intro_pt: 'Hoje você vai conhecer Anna! 🛍️' }
    render(<IntroStep step={step} vocabulary={[]} learningObjectives={[]} onContinue={vi.fn()} />)
    expect(screen.getByText('Hoje você vai conhecer Anna! 🛍️')).toBeInTheDocument()
  })
})
