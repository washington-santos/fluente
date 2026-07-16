// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { VocabRepeatStep } from '@/components/lesson/VocabRepeatStep'
import type { VocabRepeatStep as StepType, VocabItem } from '@/types/lesson'

vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: vi.fn((opts: { onComplete: (blob: Blob) => void }) => ({
    isRecording: false,
    startRecording: () => opts.onComplete(new Blob(['audio'], { type: 'audio/webm' })),
    stopRecording: vi.fn(),
    error: null,
  })),
}))

global.fetch = vi.fn()

const mockStep: StepType = {
  id: 'vr-1',
  type: 'vocab_repeat',
  vocab_index: 0,
  instruction_pt: 'Pratique a pronúncia de "hello"',
}

const mockVocab: VocabItem = {
  word: 'hello',
  translation_pt: 'olá',
  emoji: '👋',
  pronunciation_hint: 'heh-LOH',
}

function mockAssessResponse(body: unknown) {
  ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => body })
}

describe('VocabRepeatStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the word and pronunciation hint', () => {
    render(<VocabRepeatStep step={mockStep} vocab={mockVocab} onSuccess={vi.fn()} />)
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(screen.getByText('/heh-LOH/')).toBeInTheDocument()
  })

  it('shows feedback and a phoneme note when the pronunciation is close', async () => {
    mockAssessResponse({ assessment: 'close', score: 0.55, feedback_pt: 'Quase lá!', phoneme_note_pt: 'Você disse thing como "ting" — o som TH precisa da língua entre os dentes.' })
    render(<VocabRepeatStep step={mockStep} vocab={mockVocab} onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Gravar pronúncia'))
    await waitFor(() => expect(screen.getByText('Quase lá!')).toBeInTheDocument())
    expect(screen.getByText('Você disse thing como "ting" — o som TH precisa da língua entre os dentes.')).toBeInTheDocument()
  })

  it('shows no phoneme note when the pronunciation is correct', async () => {
    mockAssessResponse({ assessment: 'correct', score: 0.95, feedback_pt: 'Perfeito!', phoneme_note_pt: null })
    render(<VocabRepeatStep step={mockStep} vocab={mockVocab} onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Gravar pronúncia'))
    await waitFor(() => expect(screen.getByText('Perfeito!')).toBeInTheDocument())
    expect(screen.queryByText(/som/)).not.toBeInTheDocument()
  })

  it('allows advancing after a correct attempt, calling onSuccess with the score', async () => {
    mockAssessResponse({ assessment: 'correct', score: 0.95, feedback_pt: 'Perfeito!', phoneme_note_pt: null })
    const onSuccess = vi.fn()
    render(<VocabRepeatStep step={mockStep} vocab={mockVocab} onSuccess={onSuccess} />)
    fireEvent.click(screen.getByLabelText('Gravar pronúncia'))
    await waitFor(() => screen.getByText('Continuar →'))
    fireEvent.click(screen.getByText('Continuar →'))
    expect(onSuccess).toHaveBeenCalledWith(0.95)
  })

  it('forces advance after 3 incorrect attempts', async () => {
    const onSuccess = vi.fn()
    render(<VocabRepeatStep step={mockStep} vocab={mockVocab} onSuccess={onSuccess} />)

    for (let i = 0; i < 3; i++) {
      mockAssessResponse({ assessment: 'incorrect', score: 0.2, feedback_pt: 'Tente de novo.', phoneme_note_pt: 'O som H no início precisa de mais ar.' })
      fireEvent.click(screen.getByLabelText('Gravar pronúncia'))
      await waitFor(() => screen.getByText(`Tentativa ${i + 1} de 3`))
    }

    await waitFor(() => screen.getByText('Continuar →'))
    fireEvent.click(screen.getByText('Continuar →'))
    expect(onSuccess).toHaveBeenCalledWith(0.2)
  })

  it('shows a generic error message when the assess request fails', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network down'))
    render(<VocabRepeatStep step={mockStep} vocab={mockVocab} onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Gravar pronúncia'))
    await waitFor(() => expect(screen.getByText('Erro ao avaliar. Tente novamente.')).toBeInTheDocument())
  })

  it('shows a generic error message when the assess API returns an HTTP error', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Assessment failed' }) })
    render(<VocabRepeatStep step={mockStep} vocab={mockVocab} onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Gravar pronúncia'))
    await waitFor(() => expect(screen.getByText('Erro ao avaliar. Tente novamente.')).toBeInTheDocument())
  })
})
