// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { ErrorCard } from '@/components/dashboard/ErrorCard'

describe('ErrorCard', () => {
  it('renders error text, correct form and seen count', () => {
    render(
      <ErrorCard
        errorText="goed"
        correctForm="went"
        errorType="verb_tense"
        seenCount={3}
      />,
    )
    expect(screen.getByText(/goed/)).toBeTruthy()
    expect(screen.getByText(/went/)).toBeTruthy()
    expect(screen.getByText(/3/)).toBeTruthy()
  })
})
