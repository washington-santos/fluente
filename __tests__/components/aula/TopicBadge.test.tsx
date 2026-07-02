import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TopicBadge } from '@/components/aula/TopicBadge'

describe('TopicBadge', () => {
  it('renders the topic label', () => {
    render(<TopicBadge topic="Viagens" />)
    expect(screen.getByText('Viagens')).toBeInTheDocument()
  })
})
