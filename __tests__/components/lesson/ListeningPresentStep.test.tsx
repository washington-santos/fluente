// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ListeningPresentStep } from '@/components/lesson/ListeningPresentStep'

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ audio_url: 'data:audio/mp3;base64,AAAA' }) })

const mockStep = {
  id: 'ln-1',
  type: 'listening_present' as const,
  teacher_script: "Ana wakes up at seven and has breakfast with her family every morning.",
}

describe('ListeningPresentStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  })

  it('shows the listening label and instruction, with no passage text', () => {
    render(<ListeningPresentStep step={mockStep} ttsVoice="alloy" onContinue={vi.fn()} />)
    expect(screen.getByText('Escuta')).toBeInTheDocument()
    expect(screen.getByText('Ouça com atenção. Você vai responder perguntas sobre o que ouviu.')).toBeInTheDocument()
    expect(screen.queryByText(mockStep.teacher_script)).not.toBeInTheDocument()
  })

  it('sends speed=1.0 by default', async () => {
    render(<ListeningPresentStep step={mockStep} ttsVoice="alloy" onContinue={vi.fn()} />)
    await waitFor(() => {
      const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const body = call[1].body as FormData
      expect(body.get('speed')).toBe('1.0')
    })
  })

  it('sends speed=0.85 when strugglingMode is on', async () => {
    render(<ListeningPresentStep step={mockStep} ttsVoice="alloy" strugglingMode onContinue={vi.fn()} />)
    await waitFor(() => {
      const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const body = call[1].body as FormData
      expect(body.get('speed')).toBe('0.85')
    })
  })

  it('calls onContinue when the continue button is tapped', () => {
    const onContinue = vi.fn()
    render(<ListeningPresentStep step={mockStep} ttsVoice="alloy" onContinue={onContinue} />)
    fireEvent.click(screen.getByText('Entendi! Continuar →'))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })
})
