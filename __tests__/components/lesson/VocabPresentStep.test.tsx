// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
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
})
