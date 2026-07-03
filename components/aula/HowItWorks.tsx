'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

const STEPS = [
  { n: '1', text: 'A professora faz uma pergunta em inglês' },
  { n: '2', text: 'Você responde em inglês (fala ou digita)' },
  { n: '3', text: 'Ela corrige seus erros com explicação' },
  { n: '4', text: 'Continuamos conversando naturalmente' },
]

export function HowItWorks() {
  const [open, setOpen] = useState(false)

  return (
    <div className="w-full rounded-2xl border border-surface-light-card dark:border-surface-dark-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-content-light dark:text-content-dark hover:bg-surface-light-card dark:hover:bg-surface-dark-card transition-colors"
        aria-expanded={open}
      >
        <span>❓ Como funciona a aula?</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 bg-surface-light-card dark:bg-surface-dark-card">
          {STEPS.map((step, i) => (
            <div key={step.n} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-brand-interactive/20 text-brand-interactive text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {step.n}
              </span>
              <p className="text-sm text-content-light dark:text-content-dark">{step.text}</p>
              {i < STEPS.length - 1 && (
                <span className="sr-only">então</span>
              )}
            </div>
          ))}
          <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary mt-1 pl-9">
            Não se preocupe com erros — aprender errando faz parte! 😊
          </p>
        </div>
      )}
    </div>
  )
}
