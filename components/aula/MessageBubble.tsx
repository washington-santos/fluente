'use client'

import { Mic } from 'lucide-react'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  text: string
  hadCorrection: boolean
  pronunciationHint?: string | null
}

export function MessageBubble({ role, text, hadCorrection, pronunciationHint }: MessageBubbleProps) {
  const isUser = role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
          isUser
            ? 'bg-brand-interactive text-white rounded-br-sm'
            : 'bg-surface-light-card dark:bg-surface-dark-card text-content-light dark:text-content-dark rounded-bl-sm'
        }`}
      >
        {text}
        {hadCorrection && (
          <span
            data-testid="correction-indicator"
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-brand-streak"
            title="Correção disponível"
          />
        )}
        {!isUser && pronunciationHint && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-500 dark:text-amber-400" data-testid="pronunciation-hint">
            <Mic size={12} className="mt-0.5 flex-shrink-0" />
            <span>{pronunciationHint}</span>
          </div>
        )}
      </div>
    </div>
  )
}
