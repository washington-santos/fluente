// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/hooks/useAudioRecorder', () => ({
  useAudioRecorder: ({ onComplete }: { onComplete: (b: Blob) => void }) => ({
    isRecording: false,
    startRecording: vi.fn().mockImplementation(() => onComplete(new Blob(['audio']))),
    stopRecording: vi.fn(),
    error: null,
  }),
}))

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ score: 0.8, transcript: 'hospital', feedback_pt: 'Muito bem!' }),
})

global.Audio = vi.fn().mockImplementation(function () {
  return {
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    src: '',
  }
}) as never

import { PlacementPhaseCard } from '@/components/placement/PlacementPhaseCard'
import type { PlacementQuestion } from '@/types'

const mockQuestion: PlacementQuestion = {
  id: 'v1',
  phase: 'vocabulary',
  phase_label: 'Vocabulário',
  phase_emoji: '📚',
  prompt_tts: 'What is this? 🏥 Say the word in English.',
  prompt_display: 'O que é isso? 🏥 Diga a palavra em inglês.',
  expected_topic: 'hospital',
  difficulty: 'easy',
}

describe('PlacementPhaseCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the question prompt', () => {
    render(
      <PlacementPhaseCard
        question={mockQuestion}
        teacherVoice="shimmer"
        questionNumber={6}
        totalQuestions={10}
        onAnswer={vi.fn()}
      />
    )
    expect(screen.getByText('O que é isso? 🏥 Diga a palavra em inglês.')).toBeInTheDocument()
  })

  it('shows question counter', () => {
    render(
      <PlacementPhaseCard
        question={mockQuestion}
        teacherVoice="shimmer"
        questionNumber={6}
        totalQuestions={10}
        onAnswer={vi.fn()}
      />
    )
    expect(screen.getByText('6 / 10')).toBeInTheDocument()
  })

  it('calls onAnswer after recording stops and API responds', async () => {
    const onAnswer = vi.fn()
    render(
      <PlacementPhaseCard
        question={mockQuestion}
        teacherVoice="shimmer"
        questionNumber={6}
        totalQuestions={10}
        onAnswer={onAnswer}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /gravar/i }))
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('hospital', 0.8))
  })
})
