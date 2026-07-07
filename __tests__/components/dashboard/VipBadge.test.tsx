// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VipBadge } from '@/components/dashboard/VipBadge'

describe('VipBadge', () => {
  it('renders the VIP badge with plan name', () => {
    render(<VipBadge plan="pro" />)
    expect(screen.getByText(/VIP/i)).toBeInTheDocument()
  })

  it('shows the star icon', () => {
    render(<VipBadge plan="pro" />)
    expect(screen.getByText('⭐')).toBeInTheDocument()
  })
})
