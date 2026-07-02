// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { FlashcardDeck } from '@/components/dashboard/FlashcardDeck'

const mockCards = [
  { id: 'err-1', error_type: 'verb_tense', error_text: 'I goed to school', correct_form: 'I went to school', review_count: 0 },
  { id: 'err-2', error_type: 'vocabulary', error_text: 'He very tall', correct_form: 'He is very tall', review_count: 1 },
]

describe('FlashcardDeck', () => {
  it('shows the error_text on the front of the first card', () => {
    render(<FlashcardDeck cards={mockCards} onReview={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText('I goed to school')).toBeInTheDocument()
  })

  it('shows correct_form when card is flipped', () => {
    render(<FlashcardDeck cards={mockCards} onReview={vi.fn()} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /ver resposta/i }))
    expect(screen.getByText('I went to school')).toBeInTheDocument()
  })

  it('calls onReview with knewIt=true when "Sabia" is clicked', () => {
    const onReview = vi.fn()
    render(<FlashcardDeck cards={mockCards} onReview={onReview} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /ver resposta/i }))
    fireEvent.click(screen.getByTestId('btn-knew'))
    expect(onReview).toHaveBeenCalledWith('err-1', true, 0)
  })

  it('calls onReview with knewIt=false when "Não sabia" is clicked', () => {
    const onReview = vi.fn()
    render(<FlashcardDeck cards={mockCards} onReview={onReview} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /ver resposta/i }))
    fireEvent.click(screen.getByRole('button', { name: /não sabia/i }))
    expect(onReview).toHaveBeenCalledWith('err-1', false, 0)
  })

  it('calls onComplete when all cards are reviewed', () => {
    const onComplete = vi.fn()
    const onReview = vi.fn()
    render(<FlashcardDeck cards={[mockCards[0]]} onReview={onReview} onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: /ver resposta/i }))
    fireEvent.click(screen.getByTestId('btn-knew'))
    expect(onComplete).toHaveBeenCalled()
  })

  it('shows completion message after all cards are reviewed', () => {
    render(<FlashcardDeck cards={[mockCards[0]]} onReview={vi.fn()} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /ver resposta/i }))
    fireEvent.click(screen.getByTestId('btn-knew'))
    expect(screen.getByText(/revisão concluída/i)).toBeInTheDocument()
  })
})
