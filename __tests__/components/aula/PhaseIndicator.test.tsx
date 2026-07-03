// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PhaseIndicator } from '@/components/aula/PhaseIndicator'

describe('PhaseIndicator', () => {
  it('shows Aquecimento active at 0 assistant messages', () => {
    render(<PhaseIndicator assistantMessageCount={0} />)
    expect(screen.getByTestId('phase-0')).toHaveClass('bg-brand-interactive')
    expect(screen.getByTestId('phase-1')).not.toHaveClass('bg-brand-interactive')
  })

  it('shows Revisão de erros active at 2 assistant messages', () => {
    render(<PhaseIndicator assistantMessageCount={2} />)
    expect(screen.getByTestId('phase-1')).toHaveClass('bg-brand-interactive')
    expect(screen.getByTestId('phase-0')).not.toHaveClass('bg-brand-interactive')
  })

  it('shows Prática active at 4 assistant messages', () => {
    render(<PhaseIndicator assistantMessageCount={4} />)
    expect(screen.getByTestId('phase-2')).toHaveClass('bg-brand-interactive')
  })

  it('shows Conversa livre active at 10 assistant messages', () => {
    render(<PhaseIndicator assistantMessageCount={10} />)
    expect(screen.getByTestId('phase-3')).toHaveClass('bg-brand-interactive')
  })
})
