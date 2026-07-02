'use client'

import { X, MessageCircle, AlertCircle, Mic, Clock, Target } from 'lucide-react'

interface SessionReportProps {
  userMessages: number
  corrections: number
  pronunciationHints: number
  durationSeconds: number
  missionCompleted: boolean
  missionTitle: string
  onClose: () => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

export function SessionReport({
  userMessages,
  corrections,
  pronunciationHints,
  durationSeconds,
  missionCompleted,
  missionTitle,
  onClose,
}: SessionReportProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-light dark:bg-surface-dark rounded-2xl p-6 w-full max-w-sm flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-content-light dark:text-content-dark">
            Resumo da aula
          </h2>
          <button
            onClick={onClose}
            aria-label="Fechar resumo"
            className="text-content-light-secondary dark:text-content-dark-secondary hover:opacity-70 transition-opacity"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface-light-card dark:bg-surface-dark-card p-3 flex flex-col gap-1">
            <MessageCircle size={16} className="text-brand-cta" />
            <p className="text-2xl font-bold text-content-light dark:text-content-dark">{userMessages}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">falas enviadas</p>
          </div>
          <div className="rounded-xl bg-surface-light-card dark:bg-surface-dark-card p-3 flex flex-col gap-1">
            <AlertCircle size={16} className="text-brand-streak" />
            <p className="text-2xl font-bold text-content-light dark:text-content-dark">{corrections}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">erros corrigidos</p>
          </div>
          <div className="rounded-xl bg-surface-light-card dark:bg-surface-dark-card p-3 flex flex-col gap-1">
            <Mic size={16} className="text-amber-500" />
            <p className="text-2xl font-bold text-content-light dark:text-content-dark">{pronunciationHints}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">dicas de pronúncia</p>
          </div>
          <div className="rounded-xl bg-surface-light-card dark:bg-surface-dark-card p-3 flex flex-col gap-1">
            <Clock size={16} className="text-content-light-secondary dark:text-content-dark-secondary" />
            <p className="text-2xl font-bold text-content-light dark:text-content-dark">{formatDuration(durationSeconds)}</p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">duração</p>
          </div>
        </div>

        <div className={`rounded-xl p-3 flex items-center gap-3 ${
          missionCompleted
            ? 'bg-green-50 dark:bg-green-950/20'
            : 'bg-surface-light-card dark:bg-surface-dark-card'
        }`}>
          <Target
            size={20}
            className={missionCompleted ? 'text-green-500' : 'text-content-light-secondary dark:text-content-dark-secondary'}
          />
          <div>
            <p className={`text-sm font-semibold ${
              missionCompleted ? 'text-green-700 dark:text-green-400' : 'text-content-light dark:text-content-dark'
            }`}>
              {missionCompleted ? 'Missão concluída!' : 'Missão do dia'}
            </p>
            <p className="text-xs text-content-light-secondary dark:text-content-dark-secondary">{missionTitle}</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-brand-cta text-white font-semibold hover:opacity-90 transition-opacity"
        >
          Ir para o dashboard
        </button>
      </div>
    </div>
  )
}
