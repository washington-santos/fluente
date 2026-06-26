// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { StreakBadge } from '@/components/dashboard/StreakBadge'

describe('StreakBadge', () => {
  it('shows streak count when streak > 0', () => {
    render(<StreakBadge streakDays={7} />)
    expect(screen.getByText(/7/)).toBeTruthy()
    expect(screen.getByText(/dias/i)).toBeTruthy()
  })

  it('shows start message when streak is 0', () => {
    render(<StreakBadge streakDays={0} />)
    expect(screen.getByText(/comece/i)).toBeTruthy()
  })
})
