import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { RecordButton } from '@/components/aula/RecordButton'

describe('RecordButton', () => {
  it('shows "Pressionar para falar" when not recording', () => {
    render(<RecordButton isRecording={false} onPressStart={vi.fn()} onPressEnd={vi.fn()} disabled={false} />)
    expect(screen.getByText(/pressionar para falar/i)).toBeInTheDocument()
  })

  it('shows "Gravando..." when recording', () => {
    render(<RecordButton isRecording={true} onPressStart={vi.fn()} onPressEnd={vi.fn()} disabled={false} />)
    expect(screen.getByText(/gravando/i)).toBeInTheDocument()
  })

  it('calls onPressStart on mouse down', () => {
    const onStart = vi.fn()
    render(<RecordButton isRecording={false} onPressStart={onStart} onPressEnd={vi.fn()} disabled={false} />)
    fireEvent.mouseDown(screen.getByRole('button'))
    expect(onStart).toHaveBeenCalled()
  })

  it('calls onPressEnd on mouse up', () => {
    const onEnd = vi.fn()
    render(<RecordButton isRecording={true} onPressStart={vi.fn()} onPressEnd={onEnd} disabled={false} />)
    fireEvent.mouseUp(screen.getByRole('button'))
    expect(onEnd).toHaveBeenCalled()
  })

  it('is disabled when disabled prop is true', () => {
    render(<RecordButton isRecording={false} onPressStart={vi.fn()} onPressEnd={vi.fn()} disabled={true} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
