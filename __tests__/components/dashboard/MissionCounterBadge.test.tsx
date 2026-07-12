// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MissionCounterBadge } from '@/components/dashboard/MissionCounterBadge'

describe('MissionCounterBadge', () => {
  it('shows the completion count', () => {
    render(<MissionCounterBadge count={12} />)
    expect(screen.getByText(/12/)).toBeInTheDocument()
    expect(screen.getByText(/missões cumpridas/i)).toBeInTheDocument()
  })

  it('renders nothing when count is zero', () => {
    const { container } = render(<MissionCounterBadge count={0} />)
    expect(container.firstChild).toBeNull()
  })
})
