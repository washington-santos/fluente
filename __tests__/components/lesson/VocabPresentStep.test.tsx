// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VocabPresentStep } from '@/components/lesson/VocabPresentStep'

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ audio_url: 'data:audio/mp3;base64,AAAA' }) })

const mockStep = {
  id: 'vp-1',
  type: 'vocab_present' as const,
  vocab_index: 0,
  teacher_script: "This word is 'name'. In Portuguese, 'nome'. For example: My name is John.",
  example_sentence_en: 'My name is John.',
  example_sentence_pt: 'Meu nome é John.',
}
const mockVocab = { word: 'name', translation_pt: 'nome', emoji: '📛', pronunciation_hint: 'neym' }

describe('VocabPresentStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  })

  it('shows the word, translation, and example sentence in English then Portuguese', () => {
    render(<VocabPresentStep step={mockStep} vocab={mockVocab} ttsVoice="alloy" onContinue={vi.fn()} />)
    expect(screen.getByText('name')).toBeInTheDocument()
    expect(screen.getByText('nome')).toBeInTheDocument()
    expect(screen.getByText('My name is John.')).toBeInTheDocument()
    expect(screen.getByText('Meu nome é John.')).toBeInTheDocument()
  })

  it('sends speed=1.0 by default', async () => {
    render(<VocabPresentStep step={mockStep} vocab={mockVocab} ttsVoice="alloy" onContinue={vi.fn()} />)
    await waitFor(() => {
      const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const body = call[1].body as FormData
      expect(body.get('speed')).toBe('1.0')
    })
  })

  it('sends speed=0.85 when strugglingMode is on', async () => {
    render(<VocabPresentStep step={mockStep} vocab={mockVocab} ttsVoice="alloy" strugglingMode onContinue={vi.fn()} />)
    await waitFor(() => {
      const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const body = call[1].body as FormData
      expect(body.get('speed')).toBe('0.85')
    })
  })

  it('shows the extra example panel when provided', () => {
    const extraExample = { example_sentence_en: 'Hello again!', example_sentence_pt: 'Olá de novo!', explanation_pt: 'Outra forma de usar.' }
    render(<VocabPresentStep step={mockStep} vocab={mockVocab} ttsVoice="alloy" extraExample={extraExample} onContinue={vi.fn()} />)
    expect(screen.getByText('Hello again!')).toBeInTheDocument()
    expect(screen.getByText('💡 Dica extra')).toBeInTheDocument()
  })

  it('does not show the extra example panel when not provided', () => {
    render(<VocabPresentStep step={mockStep} vocab={mockVocab} ttsVoice="alloy" onContinue={vi.fn()} />)
    expect(screen.queryByText('💡 Dica extra')).not.toBeInTheDocument()
  })
})
