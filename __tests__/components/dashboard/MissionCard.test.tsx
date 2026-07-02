// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MissionCard } from '@/components/dashboard/MissionCard'

describe('MissionCard', () => {
  it('renders mission title and description', () => {
    render(<MissionCard titlePt="Apresentação completa" descriptionPt="Apresente-se em inglês." completed={false} />)
    expect(screen.getByText('Apresentação completa')).toBeInTheDocument()
    expect(screen.getByText('Apresente-se em inglês.')).toBeInTheDocument()
  })

  it('shows completed state when completed is true', () => {
    render(<MissionCard titlePt="Apresentação" descriptionPt="Descrição" completed={true} />)
    expect(screen.getByText(/missão concluída/i)).toBeInTheDocument()
  })

  it('does not show completed text when not completed', () => {
    render(<MissionCard titlePt="Apresentação" descriptionPt="Descrição" completed={false} />)
    expect(screen.queryByText(/missão concluída/i)).not.toBeInTheDocument()
  })
})
