// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GrammarPresentStep } from '@/components/lesson/GrammarPresentStep'

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ audio_url: 'data:audio/mp3;base64,AAAA' }) })

const mockStep = {
  id: 'gr-1',
  type: 'grammar_present' as const,
  teacher_script: "Today we'll learn possessive adjectives: my, his, her.",
  explanation_pt: 'Use "my", "his", "her" antes de um substantivo pra mostrar posse.',
  example_sentence_en: 'This is my book.',
  example_sentence_pt: 'Este é meu livro.',
}

describe('GrammarPresentStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  })

  it('shows the explanation and bilingual example', () => {
    render(<GrammarPresentStep step={mockStep} ttsVoice="alloy" onContinue={vi.fn()} />)
    expect(screen.getByText('Use "my", "his", "her" antes de um substantivo pra mostrar posse.')).toBeInTheDocument()
    expect(screen.getByText('This is my book.')).toBeInTheDocument()
    expect(screen.getByText('Este é meu livro.')).toBeInTheDocument()
  })

  it('sends speed=1.0 by default', async () => {
    render(<GrammarPresentStep step={mockStep} ttsVoice="alloy" onContinue={vi.fn()} />)
    await waitFor(() => {
      const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const body = call[1].body as FormData
      expect(body.get('speed')).toBe('1.0')
    })
  })

  it('sends speed=0.85 when strugglingMode is on', async () => {
    render(<GrammarPresentStep step={mockStep} ttsVoice="alloy" strugglingMode onContinue={vi.fn()} />)
    await waitFor(() => {
      const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const body = call[1].body as FormData
      expect(body.get('speed')).toBe('0.85')
    })
  })

  it('calls onContinue when the continue button is tapped', () => {
    const onContinue = vi.fn()
    render(<GrammarPresentStep step={mockStep} ttsVoice="alloy" onContinue={onContinue} />)
    fireEvent.click(screen.getByText('Entendi! Continuar →'))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })
})
