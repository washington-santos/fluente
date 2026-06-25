'use client'

import { useState } from 'react'
import { Type } from 'lucide-react'

interface PanicButtonProps {
  onSubmit: (text: string) => void
  disabled: boolean
}

export function PanicButton({ onSubmit, disabled }: PanicButtonProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    onSubmit(text.trim())
    setText('')
    setOpen(false)
  }

  return (
    <div>
      {open ? (
        <form onSubmit={handleSubmit} className="flex gap-2 items-center">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite sua resposta..."
            disabled={disabled}
            autoFocus
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark text-sm focus:outline-none focus:ring-2 focus:ring-brand-interactive"
          />
          <button
            type="submit"
            disabled={disabled || !text.trim()}
            className="px-4 py-2 rounded-xl bg-brand-cta text-white text-sm font-semibold disabled:opacity-50"
          >
            Enviar
          </button>
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="flex items-center gap-1 text-xs text-content-light-secondary dark:text-content-dark-secondary hover:text-brand-interactive transition-colors disabled:opacity-40"
          aria-label="Digitar resposta"
        >
          <Type size={14} /> Prefiro digitar
        </button>
      )}
    </div>
  )
}
