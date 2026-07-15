import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { SessionReport } from '@/components/aula/SessionReport'

const defaultProps = {
  userMessages: 5,
  corrections: 2,
  pronunciationHints: 1,
  durationSeconds: 180,
  missionCompleted: false,
  missionTitle: 'Apresentação completa',
  onClose: vi.fn(),
}

describe('SessionReport', () => {
  it('renders stat counts', () => {
    render(<SessionReport {...defaultProps} />)
    expect(screen.getByText('5')).toBeInTheDocument()  // userMessages
    expect(screen.getByText('2')).toBeInTheDocument()  // corrections
    expect(screen.getByText('1')).toBeInTheDocument()  // pronunciationHints
  })

  it('formats duration correctly', () => {
    render(<SessionReport {...defaultProps} durationSeconds={185} />)
    expect(screen.getByText('3m 5s')).toBeInTheDocument()
  })

  it('shows mission title', () => {
    render(<SessionReport {...defaultProps} />)
    expect(screen.getByText('Apresentação completa')).toBeInTheDocument()
  })

  it('shows "Missão concluída" when completed', () => {
    render(<SessionReport {...defaultProps} missionCompleted={true} />)
    expect(screen.getByText(/missão concluída/i)).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<SessionReport {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /praticar novamente/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the level promotion banner when levelPromotion is provided', () => {
    render(<SessionReport {...defaultProps} levelPromotion={{ from: 'A2', to: 'B1' }} />)
    expect(screen.getByText('🎉 Você subiu de nível!')).toBeInTheDocument()
    expect(screen.getByText('Parabéns! Você dominou tudo do A2 e agora está no B1.')).toBeInTheDocument()
  })

  it('does not show the level promotion banner when levelPromotion is absent', () => {
    render(<SessionReport {...defaultProps} />)
    expect(screen.queryByText('🎉 Você subiu de nível!')).not.toBeInTheDocument()
  })
})
