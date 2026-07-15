// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ExerciseFillBlankStep } from '@/components/lesson/ExerciseFillBlankStep'

const mockStep = {
  id: 'fb-1',
  type: 'exercise_fill_blank' as const,
  sentence_pt_hint: 'Meu nome é John.',
  sentence_with_blank: 'My ___ is John.',
  correct_answer: 'name',
  explanation_pt: '"Name" significa "nome".',
}

describe('ExerciseFillBlankStep', () => {
  it('shows the sentence with the blank and the Portuguese hint', () => {
    render(<ExerciseFillBlankStep step={mockStep} onSuccess={vi.fn()} />)
    expect(screen.getByText('My ___ is John.')).toBeInTheDocument()
    expect(screen.getByText('Meu nome é John.')).toBeInTheDocument()
  })

  it('accepts the correct answer case-insensitively and shows success', () => {
    render(<ExerciseFillBlankStep step={mockStep} onSuccess={vi.fn()} />)
    fireEvent.change(screen.getByTestId('fill-blank-input'), { target: { value: 'NAME' } })
    fireEvent.click(screen.getByText('Verificar'))
    expect(screen.getByText('✅ Correto!')).toBeInTheDocument()
    expect(screen.getByText('"Name" significa "nome".')).toBeInTheDocument()
  })

  it('shows the correct answer when the input is wrong', () => {
    render(<ExerciseFillBlankStep step={mockStep} onSuccess={vi.fn()} />)
    fireEvent.change(screen.getByTestId('fill-blank-input'), { target: { value: 'age' } })
    fireEvent.click(screen.getByText('Verificar'))
    expect(screen.getByText('❌ Quase — a resposta certa é "name".')).toBeInTheDocument()
  })

  it('calls onSuccess(true) when Continuar is tapped after a correct answer', () => {
    const onSuccess = vi.fn()
    render(<ExerciseFillBlankStep step={mockStep} onSuccess={onSuccess} />)
    fireEvent.change(screen.getByTestId('fill-blank-input'), { target: { value: 'name' } })
    fireEvent.click(screen.getByText('Verificar'))
    fireEvent.click(screen.getByText('Continuar →'))
    expect(onSuccess).toHaveBeenCalledWith(true)
  })

  it('calls onSuccess(false) when Continuar is tapped after a wrong answer', () => {
    const onSuccess = vi.fn()
    render(<ExerciseFillBlankStep step={mockStep} onSuccess={onSuccess} />)
    fireEvent.change(screen.getByTestId('fill-blank-input'), { target: { value: 'age' } })
    fireEvent.click(screen.getByText('Verificar'))
    fireEvent.click(screen.getByText('Continuar →'))
    expect(onSuccess).toHaveBeenCalledWith(false)
  })

  it('does not let an empty answer be checked', () => {
    render(<ExerciseFillBlankStep step={mockStep} onSuccess={vi.fn()} />)
    expect(screen.getByText('Verificar')).toBeDisabled()
  })
})
