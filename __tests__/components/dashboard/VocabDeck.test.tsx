import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { VocabDeck } from '@/components/dashboard/VocabDeck'

const mockCards = [
  { id: 'v1', word: 'negotiate', definition: 'to discuss terms to reach agreement', review_count: 0, next_review_at: '' },
  { id: 'v2', word: 'ambiguous', definition: 'open to more than one interpretation', review_count: 1, next_review_at: '' },
]
const mockOnReview = vi.fn().mockResolvedValue(undefined)
const mockOnComplete = vi.fn()

describe('VocabDeck', () => {
  it('shows the first word on front', () => {
    render(<VocabDeck cards={mockCards} onReview={mockOnReview} onComplete={mockOnComplete} />)
    expect(screen.getByTestId('vocab-front')).toHaveTextContent('negotiate')
  })

  it('reveals definition after clicking Ver definição', () => {
    render(<VocabDeck cards={mockCards} onReview={mockOnReview} onComplete={mockOnComplete} />)
    fireEvent.click(screen.getByTestId('btn-reveal'))
    expect(screen.getByTestId('vocab-back')).toHaveTextContent('to discuss terms to reach agreement')
  })

  it('calls onReview with knewIt=true when Sabia! is clicked', async () => {
    render(<VocabDeck cards={mockCards} onReview={mockOnReview} onComplete={mockOnComplete} />)
    fireEvent.click(screen.getByTestId('btn-reveal'))
    fireEvent.click(screen.getByTestId('btn-knew'))
    expect(mockOnReview).toHaveBeenCalledWith('v1', true, 0)
  })

  it('advances to the next card after review', async () => {
    render(<VocabDeck cards={mockCards} onReview={mockOnReview} onComplete={mockOnComplete} />)
    fireEvent.click(screen.getByTestId('btn-reveal'))
    fireEvent.click(screen.getByTestId('btn-knew'))
    await screen.findByText('ambiguous')
  })

  it('shows completion message when all cards are reviewed', async () => {
    const singleCard = [mockCards[0]]
    render(<VocabDeck cards={singleCard} onReview={mockOnReview} onComplete={mockOnComplete} />)
    fireEvent.click(screen.getByTestId('btn-reveal'))
    fireEvent.click(screen.getByTestId('btn-knew'))
    await screen.findByTestId('review-complete')
  })
})
