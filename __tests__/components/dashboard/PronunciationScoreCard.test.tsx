// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PronunciationScoreCard } from '@/components/dashboard/PronunciationScoreCard'

describe('PronunciationScoreCard', () => {
  it('shows the current score and label', () => {
    render(<PronunciationScoreCard currentScore={72} trend={null} />)
    expect(screen.getByText('72%')).toBeInTheDocument()
    expect(screen.getByText(/pronúncia/i)).toBeInTheDocument()
  })

  it('shows no trend icon when trend is null', () => {
    render(<PronunciationScoreCard currentScore={72} trend={null} />)
    expect(screen.queryByTestId('trend-up')).not.toBeInTheDocument()
    expect(screen.queryByTestId('trend-down')).not.toBeInTheDocument()
    expect(screen.queryByTestId('trend-flat')).not.toBeInTheDocument()
  })

  it('shows an up trend icon when trend is up', () => {
    render(<PronunciationScoreCard currentScore={80} trend="up" />)
    expect(screen.getByTestId('trend-up')).toBeInTheDocument()
  })

  it('shows a down trend icon when trend is down', () => {
    render(<PronunciationScoreCard currentScore={60} trend="down" />)
    expect(screen.getByTestId('trend-down')).toBeInTheDocument()
  })

  it('shows a flat trend icon when trend is flat', () => {
    render(<PronunciationScoreCard currentScore={70} trend="flat" />)
    expect(screen.getByTestId('trend-flat')).toBeInTheDocument()
  })
})
