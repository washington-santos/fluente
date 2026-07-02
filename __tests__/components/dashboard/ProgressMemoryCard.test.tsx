// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProgressMemoryCard } from '@/components/dashboard/ProgressMemoryCard'

describe('ProgressMemoryCard', () => {
  it('shows resolved errors count', () => {
    render(<ProgressMemoryCard resolvedErrors={3} newVocab={7} />)
    expect(screen.getByText(/3/)).toBeInTheDocument()
    expect(screen.getByText(/corrigiu/i)).toBeInTheDocument()
  })

  it('shows new vocab count', () => {
    render(<ProgressMemoryCard resolvedErrors={0} newVocab={12} />)
    expect(screen.getByText(/12/)).toBeInTheDocument()
    expect(screen.getByText(/palavras/i)).toBeInTheDocument()
  })

  it('renders nothing when both counts are zero', () => {
    const { container } = render(<ProgressMemoryCard resolvedErrors={0} newVocab={0} />)
    expect(container.firstChild).toBeNull()
  })
})
