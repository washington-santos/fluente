// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { ExerciseChoiceStep } from '@/components/lesson/ExerciseChoiceStep'
import type { ExerciseChoiceStep as StepType } from '@/types/lesson'

const step: StepType = {
  id: 'ex-1',
  type: 'exercise_choice',
  question_pt: "O que significa 'Thank you'?",
  image_emoji: '🙏',
  correct_answer: 'Obrigado',
  choices: ['Obrigado', 'Por favor', 'Tchau', 'Com licença'],
  explanation_pt: "'Thank you' significa 'Obrigado'.",
}

describe('ExerciseChoiceStep', () => {
  it('renders the question and all 4 choices', () => {
    render(<ExerciseChoiceStep step={step} onSuccess={vi.fn()} />)
    expect(screen.getByText("O que significa 'Thank you'?")).toBeInTheDocument()
    expect(screen.getByText('Obrigado')).toBeInTheDocument()
    expect(screen.getByText('Por favor')).toBeInTheDocument()
    expect(screen.getByText('Tchau')).toBeInTheDocument()
    expect(screen.getByText('Com licença')).toBeInTheDocument()
  })

  it('shows success feedback when correct answer is selected', () => {
    render(<ExerciseChoiceStep step={step} onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByText('Obrigado'))
    expect(screen.getByText('✅ Correto!')).toBeInTheDocument()
    expect(screen.getByText("'Thank you' significa 'Obrigado'.")).toBeInTheDocument()
  })

  it('shows error feedback when wrong answer is selected', () => {
    render(<ExerciseChoiceStep step={step} onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByText('Por favor'))
    expect(screen.getByText('❌ Não foi dessa vez.')).toBeInTheDocument()
    expect(screen.getByText("'Thank you' significa 'Obrigado'.")).toBeInTheDocument()
  })

  it('calls onSuccess(true) when Continuar is clicked after a correct answer', () => {
    const onSuccess = vi.fn()
    render(<ExerciseChoiceStep step={step} onSuccess={onSuccess} />)
    fireEvent.click(screen.getByText('Obrigado'))
    fireEvent.click(screen.getByText('Continuar →'))
    expect(onSuccess).toHaveBeenCalledWith(true)
  })

  it('calls onSuccess(false) when Continuar is clicked after a wrong answer', () => {
    const onSuccess = vi.fn()
    render(<ExerciseChoiceStep step={step} onSuccess={onSuccess} />)
    fireEvent.click(screen.getByText('Por favor'))
    fireEvent.click(screen.getByText('Continuar →'))
    expect(onSuccess).toHaveBeenCalledWith(false)
  })

  it('prevents changing answer after selection', () => {
    render(<ExerciseChoiceStep step={step} onSuccess={vi.fn()} />)
    fireEvent.click(screen.getByText('Por favor'))
    fireEvent.click(screen.getByText('Obrigado'))
    // Still shows error since first click was wrong
    expect(screen.getByText('❌ Não foi dessa vez.')).toBeInTheDocument()
  })

  it('does not show Continuar button before answering', () => {
    render(<ExerciseChoiceStep step={step} onSuccess={vi.fn()} />)
    expect(screen.queryByText('Continuar →')).toBeNull()
  })
})
