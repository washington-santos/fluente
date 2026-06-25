import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MessageBubble } from '@/components/aula/MessageBubble'

describe('MessageBubble', () => {
  it('renders user message text', () => {
    render(<MessageBubble role="user" text="Hello teacher!" hadCorrection={false} />)
    expect(screen.getByText('Hello teacher!')).toBeInTheDocument()
  })

  it('renders assistant message text', () => {
    render(<MessageBubble role="assistant" text="Great job!" hadCorrection={false} />)
    expect(screen.getByText('Great job!')).toBeInTheDocument()
  })

  it('shows correction indicator when hadCorrection is true', () => {
    render(<MessageBubble role="assistant" text="Good." hadCorrection={true} />)
    expect(screen.getByTestId('correction-indicator')).toBeInTheDocument()
  })

  it('does not show correction indicator when hadCorrection is false', () => {
    render(<MessageBubble role="user" text="Hi!" hadCorrection={false} />)
    expect(screen.queryByTestId('correction-indicator')).not.toBeInTheDocument()
  })
})
