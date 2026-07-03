'use client'

import { useState } from 'react'
import { BookOpen, X } from 'lucide-react'

interface WordsLearnedProps {
  words: string[]
}

export function WordsLearned({ words }: WordsLearnedProps) {
  const [open, setOpen] = useState(false)

  if (words.length === 0) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded-full bg-surface-light-card dark:bg-surface-dark-card hover:opacity-80 transition-opacity"
        aria-label={`${words.length} palavras aprendidas`}
      >
        <BookOpen size={13} className="text-brand-interactive" />
        <span className="text-xs font-semibold text-brand-interactive">{words.length}</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-8 z-50 w-56 rounded-2xl bg-surface-light dark:bg-surface-dark border border-surface-light-card dark:border-surface-dark-card shadow-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-content-light dark:text-content-dark uppercase tracking-wide">
                Palavras aprendidas
              </p>
              <button
                onClick={() => setOpen(false)}
                className="text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70"
                aria-label="Fechar"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {words.map((word) => (
                <span
                  key={word}
                  className="px-2 py-0.5 rounded-full text-xs bg-brand-interactive/10 text-brand-interactive font-medium"
                >
                  {word}
                </span>
              ))}
            </div>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">
              Revise no dashboard após a aula 📚
            </p>
          </div>
        </>
      )}
    </div>
  )
}
