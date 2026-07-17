// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BadgeIcon } from '@/components/dashboard/BadgeIcon'

describe('BadgeIcon', () => {
  it('renders the matching lucide icon for a known name', () => {
    const { container } = render(<BadgeIcon icon="Flame" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('falls back to a default icon (still an svg) for an unknown name', () => {
    const { container } = render(<BadgeIcon icon="NotARealIcon" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
