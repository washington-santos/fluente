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

  it('shows pronunciation hint for assistant message when provided', () => {
    render(
      <MessageBubble
        role="assistant"
        text="Good job!"
        hadCorrection={false}
        pronunciationHint="Try to make the 'th' sound by placing your tongue between your teeth."
      />
    )
    expect(screen.getByTestId('pronunciation-hint')).toBeInTheDocument()
    expect(screen.getByText(/tongue between your teeth/)).toBeInTheDocument()
  })

  it('does not show pronunciation hint when null', () => {
    render(<MessageBubble role="assistant" text="Good job!" hadCorrection={false} pronunciationHint={null} />)
    expect(screen.queryByTestId('pronunciation-hint')).not.toBeInTheDocument()
  })

  it('does not show pronunciation hint for user messages', () => {
    render(<MessageBubble role="user" text="Hello!" hadCorrection={false} pronunciationHint="Some hint" />)
    expect(screen.queryByTestId('pronunciation-hint')).not.toBeInTheDocument()
  })
})
