// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { WarmupReviewStep } from '@/components/lesson/WarmupReviewStep'

describe('WarmupReviewStep', () => {
  it('shows the recent summary, frequent errors, and recent words', () => {
    render(
      <WarmupReviewStep
        step={{
          id: 'warmup-1',
          type: 'warmup_review',
          recent_summary_pt: 'Você praticou o passado simples.',
          frequent_errors_pt: ['I goed to school → I went to school'],
          recent_words: ['weekend', 'travel'],
        }}
        onContinue={vi.fn()}
      />
    )
    expect(screen.getByText('Você praticou o passado simples.')).toBeInTheDocument()
    expect(screen.getByText('I goed to school → I went to school')).toBeInTheDocument()
    expect(screen.getByText('weekend')).toBeInTheDocument()
    expect(screen.getByText('travel')).toBeInTheDocument()
  })

  it('calls onContinue when the button is tapped', () => {
    const onContinue = vi.fn()
    render(
      <WarmupReviewStep
        step={{ id: 'warmup-1', type: 'warmup_review', recent_summary_pt: null, frequent_errors_pt: [], recent_words: [] }}
        onContinue={onContinue}
      />
    )
    fireEvent.click(screen.getByText('Continuar →'))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('renders without a summary/errors/words section when all are empty', () => {
    render(
      <WarmupReviewStep
        step={{ id: 'warmup-1', type: 'warmup_review', recent_summary_pt: null, frequent_errors_pt: [], recent_words: [] }}
        onContinue={vi.fn()}
      />
    )
    expect(screen.getByText('Vamos começar!')).toBeInTheDocument()
  })
})
