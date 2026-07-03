// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TextInput } from '@/components/aula/TextInput'

describe('TextInput', () => {
  it('renders text input and send button always visible', () => {
    render(<TextInput value="" onChange={vi.fn()} onSubmit={vi.fn()} onNaoEntendi={vi.fn()} disabled={false} />)
    expect(screen.getByTestId('text-input')).toBeInTheDocument()
    expect(screen.getByTestId('btn-send-text')).toBeInTheDocument()
  })

  it('calls onSubmit with trimmed text on form submit', () => {
    const onSubmit = vi.fn()
    render(<TextInput value="  hello  " onChange={vi.fn()} onSubmit={onSubmit} onNaoEntendi={vi.fn()} disabled={false} />)
    fireEvent.submit(screen.getByTestId('text-input').closest('form')!)
    expect(onSubmit).toHaveBeenCalledWith('hello')
  })

  it('does not call onSubmit when value is blank', () => {
    const onSubmit = vi.fn()
    render(<TextInput value="   " onChange={vi.fn()} onSubmit={onSubmit} onNaoEntendi={vi.fn()} disabled={false} />)
    fireEvent.submit(screen.getByTestId('text-input').closest('form')!)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('renders Não entendi button and calls onNaoEntendi on click', () => {
    const onNaoEntendi = vi.fn()
    render(<TextInput value="" onChange={vi.fn()} onSubmit={vi.fn()} onNaoEntendi={onNaoEntendi} disabled={false} />)
    fireEvent.click(screen.getByTestId('btn-nao-entendi'))
    expect(onNaoEntendi).toHaveBeenCalledTimes(1)
  })
})
