'use client'

import { useState } from 'react'
import { Mic, Eye, EyeOff, Volume2, VolumeX } from 'lucide-react'
import type { AudioStatus } from '@/types'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  text: string
  hadCorrection: boolean
  pronunciationHint?: string | null
  replyPt?: string | null
  suggestedReplies?: string[] | null
  onChipClick?: (text: string) => void
  audioStatus?: AudioStatus
  onRetryAudio?: () => void
}

export function MessageBubble({ role, text, hadCorrection, pronunciationHint, replyPt, suggestedReplies, onChipClick, audioStatus, onRetryAudio }: MessageBubbleProps) {
  const isUser = role === 'user'
  const [showTranslation, setShowTranslation] = useState(false)

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
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
        {!isUser && audioStatus === 'pending' && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-content-light-secondary dark:text-content-dark-secondary animate-pulse" data-testid="audio-pending">
            <Volume2 size={12} className="flex-shrink-0" />
            <span>Preparando áudio...</span>
          </div>
        )}
        {!isUser && audioStatus === 'failed' && (
          <button
            onClick={onRetryAudio}
            className="mt-2 flex items-center gap-1.5 text-xs text-content-light-secondary dark:text-content-dark-secondary hover:text-brand-interactive transition-colors"
            data-testid="audio-failed"
          >
            <VolumeX size={12} className="flex-shrink-0" />
            <span>Áudio indisponível — toque para tentar novamente</span>
          </button>
        )}
        {!isUser && replyPt && (
          <div className="mt-2">
            <button
              onClick={() => setShowTranslation((v) => !v)}
              className="flex items-center gap-1 text-xs text-content-light-secondary dark:text-content-dark-secondary hover:text-brand-interactive transition-colors"
              aria-label={showTranslation ? 'Ocultar tradução' : 'Ver tradução'}
              data-testid="btn-toggle-translation"
            >
              {showTranslation ? <EyeOff size={12} /> : <Eye size={12} />}
              {showTranslation ? 'Ocultar tradução' : 'Ver tradução'}
            </button>
            {showTranslation && (
              <p className="mt-1 text-xs text-content-light-secondary dark:text-content-dark-secondary italic" data-testid="reply-translation">
                {replyPt}
              </p>
            )}
          </div>
        )}
      </div>
      {!isUser && suggestedReplies && suggestedReplies.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 max-w-[80%]" data-testid="suggestion-chips">
          {suggestedReplies.map((reply, i) => (
            <button
              key={i}
              onClick={() => onChipClick?.(reply)}
              className="px-3 py-1.5 rounded-full text-xs border border-brand-interactive text-brand-interactive hover:bg-brand-interactive hover:text-content-dark transition-colors"
              data-testid={`chip-${i}`}
            >
              {reply}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
