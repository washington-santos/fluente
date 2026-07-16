// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ScoreTrendChart } from '@/components/dashboard/ScoreTrendChart'

describe('ScoreTrendChart', () => {
  it('renders nothing when there are fewer than 2 scores', () => {
    const { container: empty } = render(<ScoreTrendChart scores={[]} />)
    expect(empty.querySelector('svg')).not.toBeInTheDocument()

    const { container: single } = render(<ScoreTrendChart scores={[70]} />)
    expect(single.querySelector('svg')).not.toBeInTheDocument()
  })

  it('renders an accessible svg with one circle per score', () => {
    render(<ScoreTrendChart scores={[60, 70, 80, 90]} />)
    const svg = screen.getByRole('img', { name: /evolução/i })
    expect(svg).toBeInTheDocument()
    expect(svg.querySelectorAll('circle')).toHaveLength(4)
  })

  it('renders a single polyline connecting the points', () => {
    render(<ScoreTrendChart scores={[60, 70, 80]} />)
    const svg = screen.getByRole('img', { name: /evolução/i })
    expect(svg.querySelectorAll('polyline')).toHaveLength(1)
  })
})
