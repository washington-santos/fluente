import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { RecordButton } from '@/components/aula/RecordButton'

const defaultProps = {
  onStartRecording: vi.fn(),
  onSendRecording: vi.fn(),
  onCancelRecording: vi.fn(),
  disabled: false,
}

describe('RecordButton', () => {
  it('shows "Toque para falar" when not recording', () => {
    render(<RecordButton {...defaultProps} isRecording={false} />)
    expect(screen.getByText(/toque para falar/i)).toBeInTheDocument()
  })

  it('shows "Gravando..." when recording', () => {
    render(<RecordButton {...defaultProps} isRecording={true} />)
    expect(screen.getByText(/gravando/i)).toBeInTheDocument()
  })

  it('shows send and cancel buttons when recording', () => {
    render(<RecordButton {...defaultProps} isRecording={true} />)
    expect(screen.getByLabelText(/enviar gravação/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/cancelar gravação/i)).toBeInTheDocument()
  })

  it('calls onStartRecording when mic button is clicked', () => {
    const onStart = vi.fn()
    render(<RecordButton {...defaultProps} isRecording={false} onStartRecording={onStart} />)
    fireEvent.click(screen.getByLabelText(/iniciar gravação/i))
    expect(onStart).toHaveBeenCalled()
  })

  it('calls onSendRecording when send button is clicked', () => {
    const onSend = vi.fn()
    render(<RecordButton {...defaultProps} isRecording={true} onSendRecording={onSend} />)
    fireEvent.click(screen.getByLabelText(/enviar gravação/i))
    expect(onSend).toHaveBeenCalled()
  })

  it('calls onCancelRecording when cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(<RecordButton {...defaultProps} isRecording={true} onCancelRecording={onCancel} />)
    fireEvent.click(screen.getByLabelText(/cancelar gravação/i))
    expect(onCancel).toHaveBeenCalled()
  })

  it('mic button is disabled when disabled prop is true', () => {
    render(<RecordButton {...defaultProps} isRecording={false} disabled={true} />)
    expect(screen.getByLabelText(/iniciar gravação/i)).toBeDisabled()
  })
})
