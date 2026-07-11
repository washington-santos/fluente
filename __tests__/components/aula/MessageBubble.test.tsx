import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
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

describe('MessageBubble — translation toggle', () => {
  it('shows translation button for assistant messages with replyPt', () => {
    render(<MessageBubble role="assistant" text="Hello!" hadCorrection={false} replyPt="Olá!" />)
    expect(screen.getByTestId('btn-toggle-translation')).toBeInTheDocument()
  })

  it('hides translation by default and shows it on click', () => {
    render(<MessageBubble role="assistant" text="Hello!" hadCorrection={false} replyPt="Olá!" />)
    expect(screen.queryByTestId('reply-translation')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('btn-toggle-translation'))
    expect(screen.getByTestId('reply-translation')).toHaveTextContent('Olá!')
  })

  it('does not show translation button for user messages', () => {
    render(<MessageBubble role="user" text="Hello" hadCorrection={false} replyPt="Olá" />)
    expect(screen.queryByTestId('btn-toggle-translation')).not.toBeInTheDocument()
  })
})

describe('MessageBubble — suggestion chips', () => {
  it('renders chips for assistant messages and calls onChipClick', () => {
    const onChipClick = vi.fn()
    render(
      <MessageBubble
        role="assistant"
        text="What's your name?"
        hadCorrection={false}
        suggestedReplies={['My name is Ana.', "I'm Ana."]}
        onChipClick={onChipClick}
      />
    )
    expect(screen.getByTestId('suggestion-chips')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('chip-0'))
    expect(onChipClick).toHaveBeenCalledWith('My name is Ana.')
  })

  it('does not render chips for user messages', () => {
    render(
      <MessageBubble role="user" text="Hello" hadCorrection={false} suggestedReplies={['test']} onChipClick={vi.fn()} />
    )
    expect(screen.queryByTestId('suggestion-chips')).not.toBeInTheDocument()
  })
})

describe('MessageBubble — audio status', () => {
  it('shows a preparing indicator when audioStatus is pending', () => {
    render(<MessageBubble role="assistant" text="Hi" hadCorrection={false} audioStatus="pending" />)
    expect(screen.getByText(/preparando áudio/i)).toBeInTheDocument()
  })

  it('shows a retry affordance when audioStatus is failed', () => {
    const onRetry = vi.fn()
    render(<MessageBubble role="assistant" text="Hi" hadCorrection={false} audioStatus="failed" onRetryAudio={onRetry} />)
    const retryButton = screen.getByText(/áudio indisponível/i)
    fireEvent.click(retryButton)
    expect(onRetry).toHaveBeenCalled()
  })

  it('shows no audio indicator when audioStatus is ready or skipped', () => {
    render(<MessageBubble role="assistant" text="Hi" hadCorrection={false} audioStatus="ready" />)
    expect(screen.queryByText(/preparando áudio/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/áudio indisponível/i)).not.toBeInTheDocument()
  })
})
