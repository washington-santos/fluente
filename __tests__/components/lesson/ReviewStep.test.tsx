// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ReviewStep } from '@/components/lesson/ReviewStep'

const mockStep = { id: 'rv-1', type: 'review' as const, instruction_pt: 'Revise o vocabulário de hoje.' }
const mockVocabulary = [
  { word: 'Hello', translation_pt: 'Olá', emoji: '👋', pronunciation_hint: 'HEH-loh' },
  { word: 'Bye', translation_pt: 'Tchau', emoji: '👋', pronunciation_hint: 'bahy' },
]

describe('ReviewStep', () => {
  it('starts with translation hidden by default', () => {
    render(<ReviewStep step={mockStep} vocabulary={mockVocabulary} onComplete={vi.fn()} />)
    expect(screen.queryByText('Olá')).not.toBeInTheDocument()
    expect(screen.getByText('Ver tradução')).toBeInTheDocument()
  })

  it('reveals translation on tap', () => {
    render(<ReviewStep step={mockStep} vocabulary={mockVocabulary} onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('Ver tradução'))
    expect(screen.getByText('Olá')).toBeInTheDocument()
  })

  it('starts with translation already revealed when strugglingMode is on', () => {
    render(<ReviewStep step={mockStep} vocabulary={mockVocabulary} strugglingMode onComplete={vi.fn()} />)
    expect(screen.getByText('Olá')).toBeInTheDocument()
    expect(screen.queryByText('Ver tradução')).not.toBeInTheDocument()
  })

  it('keeps translation pre-revealed on the next card too when strugglingMode is on', () => {
    render(<ReviewStep step={mockStep} vocabulary={mockVocabulary} strugglingMode onComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('✅ Sabia!'))
    expect(screen.getByText('Tchau')).toBeInTheDocument()
  })
})
