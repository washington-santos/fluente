'use client'

import type { FormEvent } from 'react'

interface TextInputProps {
  value: string
  onChange: (v: string) => void
  onSubmit: (text: string) => void
  onNaoEntendi: () => void
  disabled: boolean
}

export function TextInput({ value, onChange, onSubmit, onNaoEntendi, disabled }: TextInputProps) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <div className="w-full flex flex-col gap-2">
      <form onSubmit={handleSubmit} className="flex gap-2 items-center">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Digite sua resposta em inglês..."
          disabled={disabled}
          className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark text-sm focus:outline-none focus:ring-2 focus:ring-brand-interactive"
          data-testid="text-input"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="px-4 py-2 rounded-xl bg-brand-cta text-content-dark text-sm font-semibold disabled:opacity-50"
          data-testid="btn-send-text"
        >
          Enviar
        </button>
      </form>
      <button
        type="button"
        onClick={onNaoEntendi}
        disabled={disabled}
        className="self-start text-xs text-content-light-secondary dark:text-content-dark-secondary hover:text-brand-interactive transition-colors disabled:opacity-40"
        data-testid="btn-nao-entendi"
      >
        🤔 Não entendi
      </button>
    </div>
  )
}
