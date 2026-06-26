// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { SessionCard } from '@/components/dashboard/SessionCard'

const session = {
  id: 's1',
  started_at: '2026-06-26T10:00:00Z',
  duration_seconds: 360,
  teacher_name: 'Mrs. Carol',
}

describe('SessionCard', () => {
  it('renders teacher name and duration', () => {
    render(<SessionCard {...session} />)
    expect(screen.getByText(/Mrs\. Carol/)).toBeTruthy()
    expect(screen.getByText(/6 min/i)).toBeTruthy()
  })

  it('renders a link to the replay page', () => {
    render(<SessionCard {...session} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toContain('/dashboard/sessao/s1')
  })
})
